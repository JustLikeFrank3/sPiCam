import React from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { styles } from '../styles/appStyles'
import { getAzureMediaUrl, getVideoMimeType, isRawVideoFile, isVideoFile } from '../utils/media'

type Props = {
  selectedMedia: string
  baseUrl: string
  mediaLoading: boolean
  setMediaLoading: (value: boolean) => void
  onBack: () => void
  onSaveToPhotos: (filename: string) => void
  onShareMedia: (filename: string) => void
}

export default function MediaPreviewScreen({
  selectedMedia,
  baseUrl,
  mediaLoading,
  setMediaLoading,
  onBack,
  onSaveToPhotos,
  onShareMedia,
}: Readonly<Props>) {
  const isVideo = isVideoFile(selectedMedia)
  const isRawVideo = isRawVideoFile(selectedMedia)

  const videoHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
          <style>
            body { margin: 0; padding: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
            video { max-width: 100%; max-height: 100%; }
          </style>
        </head>
        <body>
          <video controls autoplay style="width: 100%;">
            <source src="${getAzureMediaUrl(baseUrl, selectedMedia)}" type="${getVideoMimeType(selectedMedia)}">
            Your browser does not support video playback.
          </video>
        </body>
      </html>
    `

  let previewContent: React.ReactNode
  if (isRawVideo) {
    previewContent = <Text style={styles.eventThumbLabel}>Raw .h264 not playable</Text>
  } else if (isVideo) {
    previewContent = (
      <>
        {mediaLoading && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            <ActivityIndicator size="large" color="#d1b06b" />
            <Text style={[styles.eventThumbLabel, { marginTop: 12 }]}>Loading video...</Text>
          </View>
        )}
        <WebView
          source={{ html: videoHtml }}
          style={{ flex: 1, backgroundColor: '#000' }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onLoadStart={() => setMediaLoading(true)}
          onLoad={() => setMediaLoading(false)}
          onLoadEnd={() => setMediaLoading(false)}
        />
      </>
    )
  } else {
    previewContent = (
      <>
        {mediaLoading && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            <ActivityIndicator size="large" color="#d1b06b" />
            <Text style={[styles.eventThumbLabel, { marginTop: 12 }]}>Loading image...</Text>
          </View>
        )}
        <Image
          source={{ uri: getAzureMediaUrl(baseUrl, selectedMedia) }}
          style={styles.previewImage}
          resizeMode="contain"
          onLoadStart={() => setMediaLoading(true)}
          onLoadEnd={() => setMediaLoading(false)}
        />
      </>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }]}>
      <View style={styles.previewScreen}>
        <View style={styles.sectionHeader}>
          <Pressable onPress={onBack}>
            <Text style={styles.link}>Back</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>{isVideo ? 'Video' : 'Preview'}</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.previewContainer}>
          {previewContent}
        </View>
        <View style={styles.mediaActions}>
          <Pressable style={styles.actionButton} onPress={() => onSaveToPhotos(selectedMedia)}>
            <Text style={styles.actionButtonText}>Save to Photos</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={() => onShareMedia(selectedMedia)}>
            <Text style={styles.actionButtonSecondaryText}>Share</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}
