"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, Trash2 } from "lucide-react";
import { imagesQueryOptions } from "@/lib/query-options";
import axios from "axios";
import { useState } from "react";
import { toast } from "sonner";

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i)) + ' ' + sizes[i];
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const downloadFile = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    
    // Create a temporary URL for the blob
    const blobUrl = window.URL.createObjectURL(blob);
    
    // Create a temporary anchor element and trigger download
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Download failed:', error);
    // Fallback to opening in new tab
    window.open(url, '_blank');
  }
};

export function ImagesTable() {
  const { data: images, isLoading, error } = useQuery(imagesQueryOptions);
  const queryClient = useQueryClient();
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  const deleteImage = async (imageId: string) => {
    try {
      setDeletingImageId(imageId);
      
      await axios.delete('/api/images/files', {
        data: { imageIds: [imageId] },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OUR_AUTH_TOKEN}`,
        },
      });

      // Invalidate and refetch images query
      await queryClient.invalidateQueries({ queryKey: imagesQueryOptions.queryKey });
      
      toast.success('Image deleted successfully');
    } catch (error) {
      console.error('Error deleting image:', error);
      toast.error('Failed to delete image');
    } finally {
      setDeletingImageId(null);
    }
  };

  // Handle error state separately 
  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-destructive">
        <span>Error loading images: {error instanceof Error ? error.message : 'Unknown error'}</span>
      </div>
    );
  }

  // Sort images by upload date (newest first)  
  if (images) {
    images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Determine what rows to show
  const shouldShowSkeletonRows = isLoading;
  const shouldShowEmptyState = !isLoading && (!images || images.length === 0);
  const hasImages = !isLoading && images && images.length > 0;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Your Images</h2>
      <div className="rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Preview</TableHead>
              <TableHead className="w-20">Size</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32">Uploaded</TableHead>
              <TableHead className="w-20">Download</TableHead>
              <TableHead className="w-20">Delete</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Skeleton rows when loading */}
            {shouldShowSkeletonRows && [...Array(3)].map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                <TableCell className="w-20">
                  <div className="w-16 h-16 bg-muted animate-pulse rounded-md border"></div>
                </TableCell>
                <TableCell className="w-20">
                  <div className="h-4 w-12 bg-muted animate-pulse rounded-md"></div>
                </TableCell>
                <TableCell className="w-24">
                  <div className="h-6 w-18 bg-muted animate-pulse rounded-full"></div>
                </TableCell>
                <TableCell className="w-32">
                  <div className="h-4 w-28 bg-muted animate-pulse rounded-md"></div>
                </TableCell>
                <TableCell className="w-20">
                  <div className="h-10 w-10 bg-muted animate-pulse rounded-md"></div>
                </TableCell>
                <TableCell className="w-20">
                  <div className="h-10 w-10 bg-muted animate-pulse rounded-md"></div>
                </TableCell>
              </TableRow>
            ))}

            {/* Empty state row */}
            {shouldShowEmptyState && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No images found
                </TableCell>
              </TableRow>
            )}

            {/* Real data rows */}
            {hasImages && images.map((image) => (
              <TableRow key={image.id}>
                <TableCell className="w-20">
                  <div className="w-16 h-16 relative overflow-hidden rounded-md border">
                    <img
                      src={image.fileUrl}
                      alt="Image thumbnail"
                      className="object-cover w-full h-full"
                      loading="lazy"
                    />
                  </div>
                </TableCell>
                <TableCell className="w-20 text-sm truncate">{formatFileSize(image.sizeBytes)}</TableCell>
                <TableCell className="w-24">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium truncate ${
                    image.status === 'completed' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : image.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  }`}>
                    {image.status}
                  </span>
                </TableCell>
                <TableCell className="w-32 text-sm text-muted-foreground truncate">
                  {formatDate(image.createdAt)}
                </TableCell>
                <TableCell className="w-20">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const fileExtension = image.mimeType.split('/')[1] || 'jpg';
                      const filename = `image-${image.id}.${fileExtension}`;
                      downloadFile(image.fileUrl, filename);
                    }}
                    aria-label="Download image"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
                <TableCell className="w-20">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteImage(image.id)}
                    disabled={deletingImageId === image.id}
                    aria-label="Delete image"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
} 