export const isPhotoFile = (name: string) => /(\.jpe?g|\.png)$/i.test(name)
export const isVideoFile = (name: string) => /(\.avi|\.mp4)$/i.test(name)
export const isRawVideoFile = (name: string) => /\.h264$/i.test(name)
export const canSaveToPhotos = (name: string) => /(\.jpe?g|\.png|\.mp4|\.mov)$/i.test(name)
export const getVideoMimeType = (name: string) => (name.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'video/x-msvideo')
export const getAzureMediaUrl = (baseUrl: string, name: string) => `${baseUrl}/azure/media/${encodeURIComponent(name)}`
export const formatCustomBaseUrl = (customIp: string) => (customIp.startsWith('http') ? customIp : `http://${customIp}`)
