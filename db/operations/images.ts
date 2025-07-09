import { db } from '@/db/drizzle';
import { images, type NewImage, type Image } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Create a new image record in the database with pending status
 */
export async function createImageRecord(data: {
  userId: string;
  objectKey: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<Image> {
  const newImage: NewImage = {
    userId: data.userId,
    objectKey: data.objectKey,
    fileUrl: data.fileUrl,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    status: 'pending',
  };

  const [createdImage] = await db
    .insert(images)
    .values(newImage)
    .returning();

  return createdImage;
}

/**
 * Create multiple image records in the database with pending status in a single batch
 */
export async function createImageRecordsBatch(imageData: Array<{
  userId: string;
  objectKey: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}>): Promise<Image[]> {
  const newImages: NewImage[] = imageData.map(data => ({
    userId: data.userId,
    objectKey: data.objectKey,
    fileUrl: data.fileUrl,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    status: 'pending' as const,
  }));

  const createdImages = await db
    .insert(images)
    .values(newImages)
    .returning();

  return createdImages;
}

/**
 * Update image status to completed
 */
export async function markImageCompleted(imageId: string, userId: string): Promise<Image | null> {
  const [updatedImage] = await db
    .update(images)
    .set({ 
      status: 'completed',
      completedAt: new Date()
    })
    .where(and(eq(images.id, imageId), eq(images.userId, userId)))
    .returning();

  return updatedImage || null;
}

/**
 * Update image status to failed
 */
export async function markImageFailed(imageId: string): Promise<Image | null> {
  const [updatedImage] = await db
    .update(images)
    .set({ 
      status: 'failed',
      completedAt: new Date()
    })
    .where(eq(images.id, imageId))
    .returning();

  return updatedImage || null;
}

/**
 * Get image record by ID
 */
export async function getImageById(imageId: string): Promise<Image | null> {
  const [image] = await db
    .select()
    .from(images)
    .where(eq(images.id, imageId))
    .limit(1);

  return image || null;
}

/**
 * Get all images for a user
 */
export async function getImagesByUserId(userId: string): Promise<Image[]> {
  return await db
    .select()
    .from(images)
    .where(eq(images.userId, userId))
    .orderBy(images.createdAt);
}

/**
 * Delete an image record
 */
export async function deleteImageRecord(imageId: string): Promise<boolean> {
  const result = await db
    .delete(images)
    .where(eq(images.id, imageId));

  return result.rowCount > 0;
}

/**
 * Batch update multiple images to a specific status
 * Returns array of successfully updated images
 */
export async function updateImageStatusBatch(
  imageIds: string[],
  status: 'completed' | 'failed',
  userId: string
): Promise<Image[]> {
  const updatedImages = await db
    .update(images)
    .set({ 
      status: status,
      completedAt: new Date()
    })
    .where(and(
      inArray(images.id, imageIds),
      eq(images.userId, userId)
    ))
    .returning();

  return updatedImages;
}

/**
 * Get completed images for a user with metadata
 */
export async function getCompletedImagesByUserId(userId: string): Promise<Array<{ 
  id: string; 
  fileUrl: string; 
  mimeType: string; 
  sizeBytes: number; 
  status: string; 
  createdAt: Date; 
}>> {
  return await db
    .select({
      id: images.id,
      fileUrl: images.fileUrl,
      mimeType: images.mimeType,
      sizeBytes: images.sizeBytes,
      status: images.status,
      createdAt: images.createdAt
    })
    .from(images)
    .where(and(
      eq(images.userId, userId),
      eq(images.status, 'completed')
    ))
    .orderBy(images.createdAt);
}

/**
 * Get object keys for images owned by a user
 * Used for S3 deletion before marking as deleted in database
 */
export async function getImageObjectKeysByUserAndIds(
  userId: string,
  imageIds: string[]
): Promise<Array<{ id: string; objectKey: string; }>> {
  const results = await db
    .select({
      id: images.id,
      objectKey: images.objectKey,
    })
    .from(images)
    .where(and(
      eq(images.userId, userId),
      inArray(images.id, imageIds),
      // Only allow deletion of completed images
      eq(images.status, 'completed')
    ));

  return results;
}

/**
 * Batch mark images as deleted
 * Returns array of successfully updated images
 */
export async function markImagesAsDeleted(
  imageIds: string[],
  userId: string
): Promise<Image[]> {
  const updatedImages = await db
    .update(images)
    .set({ 
      status: 'deleted',
      completedAt: new Date()
    })
    .where(and(
      inArray(images.id, imageIds),
      eq(images.userId, userId),
      // Only allow deletion of completed images
      eq(images.status, 'completed')
    ))
    .returning();

  return updatedImages;
}

