import { createContext, useContext } from 'react';

// Upload queue shared by every screen (see UploadProvider):
// { items, documentsVersion, addFiles(files), openPicker(), dismiss(id), clearFinished() }
export const UploadContext = createContext(null);

export const useUploads = () => useContext(UploadContext);
