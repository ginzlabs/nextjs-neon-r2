import { NextRequest, NextResponse } from 'next/server';
import { authCheck } from '../auth';
import { getCompletedImagesByUserId, getImageObjectKeysByUserAndIds, markImagesAsDeleted } from '@/db/operations/images';
import { deleteFiles } from '@/utils/r2';
import { deleteImagesSchema } from '@/zod/images';

/**
 * GET /api/images/files
 * 
 * Retrieves all completed images for the authenticated user.
 * Returns image metadata including ID, file URL, type, size, status, and creation date.
 * 
 * Authentication: Required (Bearer token in Authorization header)
 * 
 * Response (Success):
 * {
 *   "images": [
 *     { 
 *       "id": "uuid1", 
 *       "fileUrl": "https://...", 
 *       "mimeType": "image/jpeg",
 *       "sizeBytes": 1024000,
 *       "status": "completed",
 *       "createdAt": "2024-01-15T10:30:00.000Z"
 *     }
 *   ]
 * }
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized (invalid or missing authentication)
 * - 500: Internal server error
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication and get user ID
    const { authenticated, userId } = authCheck(request);
    if (!authenticated || !userId) {
      return NextResponse.json(
        { error: 'Unauthorized - invalid or missing authentication' },
        { status: 401 }
      );
    }

    // Get completed images for the user
    const images = await getCompletedImagesByUserId(userId);

    return NextResponse.json({ images }, { status: 200 });

  } catch (error) {
    console.error('Error in get images endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 

/**
 * DELETE /api/images/files
 * 
 * Deletes multiple images for the authenticated user.
 * First deletes images from S3, then marks them as deleted in the database.
 * Only allows deletion of completed images that belong to the user.
 * 
 * Authentication: Required (Bearer token in Authorization header)
 * 
 * Request Body:
 * {
 *   "imageIds": ["uuid1", "uuid2", "uuid3"]
 * }
 * 
 * Response (Success):
 * {
 *   "message": "Images deleted successfully",
 *   "deletedCount": 3,
 *   "deletedImages": [
 *     { "id": "uuid1", "objectKey": "userId/fileId1" },
 *     { "id": "uuid2", "objectKey": "userId/fileId2" },
 *     { "id": "uuid3", "objectKey": "userId/fileId3" }
 *   ]
 * }
 * 
 * Status Codes:
 * - 200: Success
 * - 400: Bad request (invalid image IDs or validation errors)
 * - 401: Unauthorized (invalid or missing authentication)
 * - 403: Forbidden (images don't belong to user or not in completed status)
 * - 500: Internal server error
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication and get user ID
    const { authenticated, userId } = authCheck(request);
    if (!authenticated || !userId) {
      return NextResponse.json(
        { error: 'Unauthorized - invalid or missing authentication' },
        { status: 401 }
      );
    }

    // Parse and validate request body using Zod
    const body = await request.json();
    const validationResult = deleteImagesSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: validationResult.error.errors 
        },
        { status: 400 }
      );
    }

    const { imageIds } = validationResult.data;

    // Get object keys for images owned by the user
    const imageObjectKeys = await getImageObjectKeysByUserAndIds(userId, imageIds);

    // Check if any images were found
    if (imageObjectKeys.length === 0) {
      return NextResponse.json(
        { error: 'No images found or images do not belong to user' },
        { status: 403 }
      );
    }

    // Check if all requested images were found
    const foundImageIds = imageObjectKeys.map(img => img.id);
    const missingImageIds = imageIds.filter(id => !foundImageIds.includes(id));
    
    if (missingImageIds.length > 0) {
      return NextResponse.json(
        { 
          error: 'Some images not found or do not belong to user',
          missingImageIds 
        },
        { status: 403 }
      );
    }

    // Delete images from S3 using the R2 utility function
    const objectKeys = imageObjectKeys.map(image => image.objectKey);
    
    try {
      const response = await deleteFiles(objectKeys);
      
      // Check if there were any errors in the batch delete
      if (response.Errors && response.Errors.length > 0) {
        console.error('S3 batch delete errors:', response.Errors);
        return NextResponse.json(
          { 
            error: 'Failed to delete some images from storage',
            details: response.Errors.map(err => ({
              key: err.Key,
              code: err.Code,
              message: err.Message
            }))
          },
          { status: 500 }
        );
      }
    } catch (error) {
      console.error('Error deleting files from S3:', error);
      return NextResponse.json(
        { error: 'Failed to delete images from storage' },
        { status: 500 }
      );
    }

    // Mark images as deleted in database
    const deletedImages = await markImagesAsDeleted(imageIds, userId);

    return NextResponse.json({
      message: 'Images deleted successfully',
      deletedCount: deletedImages.length,
      deletedImages: deletedImages.map(img => ({
        id: img.id,
        objectKey: img.objectKey
      }))
    }, { status: 200 });

  } catch (error) {
    console.error('Error in delete images endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 