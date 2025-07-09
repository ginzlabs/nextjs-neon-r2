import { v4 as uuidv4 } from 'uuid';

export interface PreparedImage {
  fileId: string;
  fileType: string;
  fileSize: number;
  blob: Blob;
}

export interface PreparedImageWithData {
  fileId: string;
  fileType: string;
  fileSize: number;
  data: string;
}

// Helper function to convert image to WebP and optimize size
const convertAndOptimizeImage = async (file: File, maxSizeBytes: number): Promise<PreparedImage> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      // Calculate dimensions to maintain aspect ratio
      let { width, height } = img;
      
      // If image is too large, scale it down
      const maxDimension = 1920; // Max width or height
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw image on canvas
      ctx.drawImage(img, 0, 0, width, height);
      
      // Function to try different quality levels
      const tryQuality = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to convert image'));
              return;
            }
            
            if (blob.size <= maxSizeBytes || quality <= 0.1) {
              // If size is acceptable or we've reached minimum quality
              resolve({
                fileId: uuidv4(),
                fileType: 'image/webp',
                fileSize: blob.size,
                blob: blob
              });
            } else {
              // Try with lower quality
              tryQuality(quality - 0.1);
            }
          },
          'image/webp',
          quality
        );
      };
      
      // Start with quality 0.9 and reduce if needed
      tryQuality(0.9);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = URL.createObjectURL(file);
  });
};

// Function to prepare all images for upload
export const prepareImagesForUpload = async (files: File[], maxSizeKB: number): Promise<PreparedImage[]> => {
  const maxSizeBytes = maxSizeKB * 1024; // Convert KB to bytes
  const promises = files.map(file => convertAndOptimizeImage(file, maxSizeBytes));
  
  try {
    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    console.error('Error preparing images:', error);
    throw error;
  }
};
