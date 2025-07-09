import { NextRequest, NextResponse } from 'next/server';
import { presignRequestSchema } from '@/zod/images';
import { authCheck } from '../auth';
import { getSignedUrlForUpload } from '@/utils/r2';
import { createImageRecordsBatch } from '@/db/operations/images';

const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL;
const IMAGE_EXPIRATION_SECONDS = parseInt(process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE_KB || '300');


export async function POST(request: NextRequest) {
  try {
    // STEP 1: Check authentication and get user id
    const { userId } = authCheck(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - invalid or missing authentication' },
        { status: 401 }
      );
    }

    // STEP 2: Parse and validate request body using zod
    const body = await request.json();
    const validationResult = presignRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: validationResult.error.errors 
        },
        { status: 400 }
      );
    }
    
    const { images } = validationResult.data;

    // STEP 3: Generate presigned URLs for all images
    const presignedResults = await Promise.all(
      images.map(async (image) => {
        const { fileId, fileType, fileSize } = image;
        
        const objectKey = `${userId}/${fileId}`;
        const publicFileUrl = `${R2_PUBLIC_BASE_URL}/${objectKey}`;

        // Generate Presigned URL for Upload using R2 utility
        const presignedUrl = await getSignedUrlForUpload(objectKey, fileType, fileSize);
        
        return {
          objectKey,
          presignedUrl,
          publicFileUrl,
          fileType,
          fileSize,
          expiresAt: new Date(Date.now() + IMAGE_EXPIRATION_SECONDS * 1000)
        };
      })
    );

    // STEP 4: Create database records in batch
    const imageData = presignedResults.map(result => ({
      userId: userId!,
      objectKey: result.objectKey,
      fileUrl: result.publicFileUrl,
      mimeType: result.fileType,
      sizeBytes: result.fileSize,
    }));

    const imageRecords = await createImageRecordsBatch(imageData);

    // Combine presigned URLs with database record IDs
    const results = presignedResults.map((result, index) => ({
      objectKey: result.objectKey,
      presignedUrl: result.presignedUrl,
      publicFileUrl: result.publicFileUrl,
      imageId: imageRecords[index].id,
      expiresAt: result.expiresAt
    }));

    // STEP 5: Return array of presigned URLs and upload metadata
    return NextResponse.json({
      results
    }, { status: 200 });

  } catch (error) {
    console.error('Error in presign endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 