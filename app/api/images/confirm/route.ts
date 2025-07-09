import { NextRequest, NextResponse } from 'next/server';
import { confirmUploadSchema, type ConfirmUploadResponse } from '@/zod/images';
import { authCheck } from '../auth';
import { updateImageStatusBatch } from '@/db/operations/images';

/**
 * POST /api/images/confirm
 * 
 * Updates the status of image uploads to either "completed" or "failed".
 * This endpoint should be called after the client has attempted to upload
 * images using the presigned URLs obtained from /api/images/presign.
 * 
 * All images are processed in a single database transaction for atomicity.
 * Updates are batched by status for optimal performance.
 * Only images that exist and belong to the authenticated user will be updated.
 * 
 * Authentication: Required (Bearer token in Authorization header)
 * 
 * Request Body:
 * {
 *   "updates": [
 *     { "imageId": "uuid1", "status": "completed" },
 *     { "imageId": "uuid2", "status": "failed" },
 *     ...
 *   ]
 * }
 * 
 * Response (Success):
 * {
 *   "message": "Images updated successfully",
 *   "updatedCount": 2
 * }
 * 
 * Status Codes:
 * - 200: Operation successful (check updatedCount for how many were updated)
 * - 400: Invalid request data (validation error)
 * - 401: Unauthorized (invalid or missing authentication)
 * - 500: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    // STEP 1: Check authentication and get user id
    const { authenticated, userId } = authCheck(request);
    if (!authenticated || !userId) {
      return NextResponse.json(
        { error: 'Unauthorized - invalid or missing authentication' },
        { status: 401 }
      );
    }

    // STEP 2: Parse and validate request body using zod
    const body = await request.json();
    const validationResult = confirmUploadSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: validationResult.error.errors 
        },
        { status: 400 }
      );
    }
    
    const { updates } = validationResult.data;

    // STEP 3: Group updates by status
    const groupedUpdates = updates.reduce((acc, update) => {
      if (!acc[update.status]) {
        acc[update.status] = [];
      }
      acc[update.status].push(update.imageId);
      return acc;
    }, {} as Record<'completed' | 'failed', string[]>);

    // STEP 4: Process all updates by status
    const allUpdatedImages = [];

    // Process completed images
    if (groupedUpdates.completed && groupedUpdates.completed.length > 0) {
      const completedImages = await updateImageStatusBatch(
        groupedUpdates.completed,
        'completed',
        userId
      );
      allUpdatedImages.push(...completedImages);
    }

    // Process failed images
    if (groupedUpdates.failed && groupedUpdates.failed.length > 0) {
      const failedImages = await updateImageStatusBatch(
        groupedUpdates.failed,
        'failed',
        userId
      );
      allUpdatedImages.push(...failedImages);
    }
    
    // STEP 5: Return simple success response
    const response: ConfirmUploadResponse = {
      message: 'Images table updated successfully',
      updatedCount: allUpdatedImages.length
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Error in confirm upload endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 