import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  uploadBytesResumable,
  type UploadTask,
} from "firebase/storage";
import { storage } from "./config";
import { generateId } from "@/lib/utils";

export async function uploadFile(
  file: File,
  path: string
): Promise<string> {
  const fileRef = ref(storage, `${path}/${generateId()}_${file.name}`);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
}

export function uploadFileWithProgress(
  file: File,
  path: string
): UploadTask {
  const fileRef = ref(storage, `${path}/${generateId()}_${file.name}`);
  return uploadBytesResumable(fileRef, file);
}

export async function getFileUrl(path: string): Promise<string> {
  const fileRef = ref(storage, path);
  return getDownloadURL(fileRef);
}

export async function deleteFile(path: string): Promise<void> {
  const fileRef = ref(storage, path);
  return deleteObject(fileRef);
}
