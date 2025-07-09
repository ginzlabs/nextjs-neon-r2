"use client";

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { prepareImagesForUpload } from "@/lib/images/prep-images-for-upload";
import { imagesQueryOptions } from "@/lib/query-options";
import { toast } from "sonner";
import { CloudUpload, Plus } from "lucide-react";
import axios from 'axios';

const MAX_IMAGES = 5;

interface PresignResult {
  objectKey: string;
  presignedUrl: string;
  publicFileUrl: string;
  imageId: string;
  expiresAt: Date;
}

const Form = () => {
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastUploadDuration, setLastUploadDuration] = useState<number | null>(null);
  const [currentUploadTime, setCurrentUploadTime] = useState(0);
  const uploadStartTimeRef = useRef<number | null>(null);

  const onDrop = (acceptedFiles: File[]) => {
    const totalFiles = selectedFiles.length + acceptedFiles.length;
    
    if (totalFiles > MAX_IMAGES) {
      toast.error("Maximum images reached", {
        description: `Add up to ${MAX_IMAGES} images`
      });
      return;
    }
    
    // Clear progress when new files are selected
    setUploadProgress(0);
    setCurrentUploadTime(0);
    setSelectedFiles(prev => [...prev, ...acceptedFiles]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': []
    },
    multiple: true,
    disabled: selectedFiles.length >= MAX_IMAGES
  });

  const handleRemoveFile = (indexToRemove: number) => {
    setSelectedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    
    setIsUploading(true);
    uploadStartTimeRef.current = Date.now();
    
    // Set initial progress to 10% after a small delay for smoother UX
    setTimeout(() => setUploadProgress(10), 100);
    
    try {
      console.log('Preparing images for upload...');
      
      // Get max image size from environment variable, default to 1024 KB if not set
      const maxImageSizeKB = parseInt(process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE_KB || '1024');
      
      const preparedImages = await prepareImagesForUpload(selectedFiles, maxImageSizeKB);
      
      console.log('Prepared images:', preparedImages.map(img => ({
        fileId: img.fileId,
        fileType: img.fileType,
        fileSize: img.fileSize
      })));
      
      // STEP 1: Get presigned URLs from our API
      console.log('Getting presigned URLs...');
      const presignResponse = await axios.post('/api/images/presign', {
        images: preparedImages.map(img => ({
          fileId: img.fileId,
          fileType: img.fileType,
          fileSize: img.fileSize
        }))
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OUR_AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      const { results } = presignResponse.data;
      console.log('Presigned URLs received:', results);
      
      // STEP 2: Upload each image directly to R2 using presigned URLs
      console.log('Uploading images to R2...');
      const progressByImage = new Array(results.length).fill(0);
      const uploadStatuses: Array<{ imageId: string; status: 'completed' | 'failed' }> = [];
      
      const uploadPromises = results.map(async (result: PresignResult, index: number) => {
        const imageData = preparedImages[index];
        
        try {
          // Upload to R2 using presigned URL directly with the blob
          await axios.put(result.presignedUrl, imageData.blob, {
            headers: {
              'Content-Type': imageData.fileType,
            },
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
              progressByImage[index] = percentCompleted;
              
              // Calculate overall progress
              const totalProgress = progressByImage.reduce((sum, progress) => sum + progress, 0);
              const averageProgress = Math.round(totalProgress / results.length);
              setUploadProgress(averageProgress);
            },
          });
          
          // Track successful upload
          uploadStatuses.push({
            imageId: result.imageId,
            status: 'completed'
          });
          
          return {
            imageId: result.imageId,
            publicFileUrl: result.publicFileUrl,
            objectKey: result.objectKey,
            success: true
          };
        } catch (error) {
          console.error(`Failed to upload image ${result.imageId}:`, error);
          
          // Track failed upload
          uploadStatuses.push({
            imageId: result.imageId,
            status: 'failed'
          });
          
          return {
            imageId: result.imageId,
            publicFileUrl: result.publicFileUrl,
            objectKey: result.objectKey,
            success: false
          };
        }
      });
      
      const uploadResults = await Promise.all(uploadPromises);
      
      // Calculate upload duration
      const uploadEndTime = Date.now();
      const uploadDuration = uploadEndTime - uploadStartTimeRef.current;
      setLastUploadDuration(uploadDuration);
      
      console.log('Upload completed!', uploadResults);
      
      // STEP 3: Confirm upload status with our API
      console.log('Confirming upload status with database...');
      try {
        const confirmResponse = await axios.post('/api/images/confirm', {
          updates: uploadStatuses
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OUR_AUTH_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Upload status confirmed:', confirmResponse.data);
      } catch (error) {
        console.error('Error confirming upload status:', error);
        // Continue with success flow even if confirmation fails
        // The user's images are already uploaded to R2
      }
      
      // Check if any uploads failed
      const failedUploads = uploadResults.filter(result => !result.success);
      const successfulUploads = uploadResults.filter(result => result.success);
      
      if (failedUploads.length > 0) {
        console.warn(`${failedUploads.length} uploads failed, ${successfulUploads.length} succeeded`);
        // You might want to show a partial success message to the user
      }
      
      // Clear selected files after upload attempt
      setSelectedFiles([]);
      
      // Reset progress
      setUploadProgress(0);
      
      // Show success message if at least some uploads succeeded
      if (successfulUploads.length > 0) {
        // Invalidate the images query to refetch the table data
        queryClient.invalidateQueries({ queryKey: imagesQueryOptions.queryKey });
        toast.success("Upload successful!", {
          description: "Your images have been uploaded successfully"
        });
      }
      
    } catch (error) {
      console.error('Error uploading files:', error);
      setUploadProgress(0);
      // You might want to show an error message to the user here
    } finally {
      setIsUploading(false);
      setCurrentUploadTime(0);
    }
  };

  useEffect(() => {
    let uploadTimer: ReturnType<typeof setInterval> | undefined;

    if (isUploading) {
      uploadTimer = setInterval(() => {
        const currentTime = Date.now();
        const elapsedTime = currentTime - (uploadStartTimeRef.current || 0);
        setCurrentUploadTime(elapsedTime);
      }, 100);
    }

    return () => {
      if (uploadTimer) {
        clearInterval(uploadTimer);
      }
    };
  }, [isUploading]);

  return (
    <div className="flex flex-col items-center w-full pt-20 space-y-6">
      <div 
        className={cn(
          "h-[200px] w-[300px] flex flex-col items-center justify-center space-y-3 cursor-pointer",
          "border-2 border-dashed border-muted-foreground/25 bg-background",
          "rounded-lg shadow-sm hover:bg-accent/50 transition-colors",
          isDragActive && "border-blue-400 bg-blue-50/50 border-solid",
          selectedFiles.length >= MAX_IMAGES && "opacity-50 cursor-not-allowed"
        )}
        {...getRootProps()}
      >
        <input {...getInputProps()} />
        <div className="w-20 h-20 flex items-center justify-center text-muted-foreground">
          <div className="flex items-center space-x-1">
            <Plus className="w-6 h-6" />
            <CloudUpload className="w-12 h-12" />
          </div>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <span className="text-sm font-medium">
            {isDragActive ? 'Drop images here' : 'Add images'}
          </span>
          <span className="text-xs text-muted-foreground">
            {selectedFiles.length} of {MAX_IMAGES} images selected
          </span>
        </div>
      </div>

      {/* Upload Timer Display */}
      <div className="text-sm text-muted-foreground">
        {isUploading ? (
          <span>Current upload time: {(currentUploadTime / 1000).toFixed(2)}s</span>
        ) : lastUploadDuration ? (
          <span>Last upload took: {(lastUploadDuration / 1000).toFixed(2)}s</span>
        ) : (
          <span>No previous uploads</span>
        )}
      </div>



      {isUploading && (
        <div className="w-[300px] space-y-2">
          <div className="text-sm text-muted-foreground">
            Uploading images... {uploadProgress}%
          </div>
          <Progress value={uploadProgress} className="w-full [&>[data-slot=progress-indicator]]:bg-green-600" />
        </div>
      )}

      {/* Always reserve space for image previews to prevent layout shifts */}
      <div className="flex flex-wrap gap-4 justify-center max-w-[600px] min-h-[80px]">
        {selectedFiles.map((file, index) => (
          <div key={index} className="relative">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-muted">
              <img
                src={URL.createObjectURL(file)}
                alt={`Preview ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
            <Button
              onClick={() => handleRemoveFile(index)}
              variant="destructive"
              size="icon"
              className="h-6 w-6 absolute -top-2 -right-2 rounded-full"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                className="w-4 h-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        ))}
        {/* Show placeholder slots for remaining images */}
        {Array.from({ length: MAX_IMAGES - selectedFiles.length }).map((_, index) => (
          <div key={`placeholder-${index}`} className="w-16 h-16 rounded-full bg-muted/30 border-2 border-dashed border-muted-foreground/20"></div>
        ))}
      </div>

      {/* Always show upload button to prevent layout shifts */}
      <Button
        onClick={handleUpload}
        className="min-w-[200px]"
        disabled={isUploading || selectedFiles.length === 0}
      >
        {isUploading ? 'Uploading...' : selectedFiles.length === 0 ? 'Select images to upload' : `Upload ${selectedFiles.length} ${selectedFiles.length === 1 ? 'image' : 'images'}`}
      </Button>
    </div>
  );
}

export default Form;
