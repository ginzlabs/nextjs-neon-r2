import { z } from 'zod';

// Get max image size from environment variables (convert KB to bytes)
const MAX_IMAGE_SIZE_BYTES = parseInt(process.env.MAX_IMAGE_SIZE_KB || '1024') * 1024;

// Get max number of images from environment variables
const MAX_IMAGES = parseInt(process.env.MAX_IMAGES || '5');

// Schema for a single image request
const singleImageSchema = z.object({
  fileId: z.string().uuid('File ID must be a valid UUID'),
  fileType: z.string().min(1, 'File type is required'),
  fileSize: z.number().positive('File size must be positive').max(MAX_IMAGE_SIZE_BYTES, `File size must not exceed ${MAX_IMAGE_SIZE_BYTES / 1024}KB`),
});

// Schema for presign request body (now accepts array of images)
export const presignRequestSchema = z.object({
  images: z.array(singleImageSchema)
    .min(1, 'At least one image is required')
    .max(MAX_IMAGES, `Maximum ${MAX_IMAGES} images allowed`),
});

// Schema for confirming image uploads
export const confirmUploadSchema = z.object({
  updates: z.array(z.object({
    imageId: z.string().uuid('Image ID must be a valid UUID'),
    status: z.enum(['completed', 'failed'], {
      errorMap: () => ({ message: 'Status must be either "completed" or "failed"' })
    })
  }))
    .min(1, 'At least one image update is required')
    .max(MAX_IMAGES, `Maximum ${MAX_IMAGES} image updates allowed per request`),
});

// Schema for deleting images
export const deleteImagesSchema = z.object({
  imageIds: z.array(z.string().uuid('Image ID must be a valid UUID'))
    .min(1, 'At least one image ID is required')
    .max(MAX_IMAGES, `Maximum ${MAX_IMAGES} images can be deleted per request`),
});

// Schema for a single presign response
const singlePresignResponseSchema = z.object({
  objectKey: z.string(),
  presignedUrl: z.string().url(),
  publicFileUrl: z.string().url(),
  imageId: z.string().uuid(),
  expiresAt: z.date(),
});

// Schema for presign response (now returns array of results)
export const presignResponseSchema = z.object({
  results: z.array(singlePresignResponseSchema),
});

// Schema for confirm upload response
export const confirmUploadResponseSchema = z.object({
  message: z.string(),
  updatedCount: z.number(),
});

// Schema for image status update
export const imageStatusUpdateSchema = z.object({
  status: z.enum(['pending', 'completed', 'failed', 'canceled']),
  completedAt: z.date().optional(),
});

// Type exports
export type SingleImageRequest = z.infer<typeof singleImageSchema>;
export type PresignRequest = z.infer<typeof presignRequestSchema>;
export type ConfirmUploadRequest = z.infer<typeof confirmUploadSchema>;
export type DeleteImagesRequest = z.infer<typeof deleteImagesSchema>;
export type SinglePresignResponse = z.infer<typeof singlePresignResponseSchema>;
export type PresignResponse = z.infer<typeof presignResponseSchema>;
export type ConfirmUploadResponse = z.infer<typeof confirmUploadResponseSchema>;
export type ImageStatusUpdate = z.infer<typeof imageStatusUpdateSchema>;

// Additional type for individual image update
export type ImageUpdate = {
  imageId: string;
  status: 'completed' | 'failed';
}; 