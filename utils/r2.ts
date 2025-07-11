import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface FileObject {
  Key?: string
  LastModified?: Date
  ETag?: string
  Size?: number
  StorageClass?: string
}

const R2_ENDPOINT_URL = process.env.R2_ENDPOINT_URL!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!

const S3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
})

export async function uploadFile(file: Buffer, key: string) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: file
  })

  try {
    const response = await S3.send(command)
    return response
  } catch (error) {
    console.error('Error uploading file:', error)
    throw error
  }
}

export async function getSignedUrlForUpload(
  key: string,
  contentType: string,
  fileSize: number
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: fileSize
  })

  try {
    const signedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 })
    return signedUrl
  } catch (error) {
    console.error('Error generating signed URL:', error)
    throw error
  }
}

export async function getSignedUrlForDownload(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key
  })

  try {
    const signedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 })
    return signedUrl
  } catch (error) {
    console.error('Error generating signed URL:', error)
    throw error
  }
}

export async function listFiles(prefix: string = ''): Promise<FileObject[]> {
  const command = new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
    Prefix: prefix
  })

  try {
    const response = await S3.send(command)
    return response.Contents || []
  } catch (error) {
    console.error('Error listing files:', error)
    throw error
  }
}

export async function deleteFile(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key
  })

  try {
    const response = await S3.send(command)
    return response
  } catch (error) {
    console.error('Error deleting file:', error)
    throw error
  }
}

export async function deleteFiles(keys: string[]) {
  const command = new DeleteObjectsCommand({
    Bucket: R2_BUCKET_NAME,
    Delete: {
      Objects: keys.map(key => ({ Key: key })),
    },
  })

  try {
    const response = await S3.send(command)
    return response
  } catch (error) {
    console.error('Error deleting files:', error)
    throw error
  }
} 