/**
 * Service to handle uploads to Cloudinary using Unsigned Upload Presets.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = 'sistema_compras_preset';

export interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  format: string;
  resource_type: string;
  created_at: string;
  bytes: number;
  width?: number;
  height?: number;
}

export const uploadToCloudinary = async (file: File, folder?: string): Promise<CloudinaryUploadResponse> => {
  if (!CLOUD_NAME) {
    throw new Error('Cloudinary Cloud Name not configured in environment variables.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  
  if (folder) {
    formData.append('folder', folder);
  }

  // Use 'auto' to let Cloudinary detect if it's an image, video, or raw (PDF)
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Error uploading to Cloudinary');
    }

    return await response.json();
  } catch (error: any) {
    console.error('[CloudinaryService] Upload Error:', error);
    throw error;
  }
};
