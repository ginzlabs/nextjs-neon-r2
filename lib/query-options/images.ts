import { queryOptions } from "@tanstack/react-query";
import axios from "axios";

export interface ImageData {
  id: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
}

const fetchImages = async (): Promise<ImageData[]> => {
      const response = await axios.get("/api/images/files", {
    headers: {
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OUR_AUTH_TOKEN}`,
    },
  });
  return response.data.images;
};

export const imagesQueryOptions = queryOptions({
  queryKey: ['images'],
  queryFn: fetchImages,
  refetchInterval: 30 * 60 * 1000, // Auto-refresh every 30 minutes
}); 