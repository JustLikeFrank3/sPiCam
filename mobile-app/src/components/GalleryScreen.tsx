import React from 'react'
import { FlatList, Image, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { styles } from '../styles/appStyles'
import { Colors } from '../styles/colors'
import { getAzureMediaUrl, isPhotoFile, isRawVideoFile, isVideoFile } from '../utils/media'

type EventItem = {
  name: string
  last_modified?: string | null
}

type Props = {
  baseUrl: string
  events: EventItem[]
  recentsFilter: 'all' | 'photos' | 'videos'
  onSetFilter: (filter: 'all' | 'photos' | 'videos') => void
  onBack: () => void
  onSelectMedia: (name: string) => void
}

const getThumbLabel = (isRawVideo: boolean, isVideo: boolean) => {
  if (isRawVideo) return 'RAW'
  if (isVideo) return 'VIDEO'
  return 'FILE'
}

const getTypePillLabel = (isRawVideo: boolean, isVideo: boolean) => {
  if (isRawVideo) return 'Raw'
  if (isVideo) return 'Video'
  return 'Photo'
}

const getFilterLabel = (filter: 'all' | 'photos' | 'videos') => {
  if (filter === 'all') return 'All'
  if (filter === 'photos') return 'Photos'
  return 'Videos'
}

const getPillStyle = (isRawVideo: boolean, isVideo: boolean) => {
  if (isRawVideo) return styles.eventPillRaw
  if (isVideo) return styles.eventPillVideo
  return styles.eventPill
}

const getPillTextStyle = (isRawVideo: boolean, isVideo: boolean) => {
  if (isRawVideo) return styles.eventPillTextRaw
  if (isVideo) return styles.eventPillTextVideo
  return styles.eventPillText
}

const renderEventPill = (isRawVideo: boolean, isVideo: boolean, label: string) => {
  return (
    <View style={getPillStyle(isRawVideo, isVideo)}>
      <Text style={getPillTextStyle(isRawVideo, isVideo)}>{label}</Text>
    </View>
  )
}

export default function GalleryScreen({
  baseUrl,
  events,
  recentsFilter,
  onSetFilter,
  onBack,
  onSelectMedia,
}: Readonly<Props>) {
  const filteredEvents = events.filter(item => {
    if (recentsFilter === 'all') return true
    if (recentsFilter === 'photos') return isPhotoFile(item.name)
    return isVideoFile(item.name)
  })

  const renderEvent = ({ item }: { item: EventItem }) => {
    const isVideo = isVideoFile(item.name)
    const isRawVideo = isRawVideoFile(item.name)

    return (
      <Pressable style={styles.eventItem} onPress={() => onSelectMedia(item.name)}>
        <View style={styles.eventRow}>
          <View style={styles.eventThumb}>
            {isPhotoFile(item.name) ? (
              <Image source={{ uri: getAzureMediaUrl(baseUrl, item.name) }} style={styles.eventThumbImage} />
            ) : (
              <Text style={styles.eventThumbLabel}>{getThumbLabel(isRawVideo, isVideo)}</Text>
            )}
          </View>
          <View style={styles.eventMeta}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.eventTime}>{item.last_modified ? new Date(item.last_modified).toLocaleString() : 'Unknown'}</Text>
            <View style={styles.eventPillRow}>
              {renderEventPill(isRawVideo, isVideo, getTypePillLabel(isRawVideo, isVideo))}
            </View>
          </View>
          <Text style={styles.eventChevron}>›</Text>
        </View>
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.galleryHeader}>
        <Pressable style={styles.galleryBackButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={16} color={Colors.primary} />
          <Text style={styles.galleryBackText}>Back</Text>
        </Pressable>
        <Text style={styles.galleryTitle}>Recent Events</Text>
        <Text style={styles.galleryCount}>{filteredEvents.length} items</Text>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'photos', 'videos'] as const).map(filter => (
          <Pressable
            key={filter}
            onPress={() => onSetFilter(filter)}
            style={recentsFilter === filter ? styles.filterChipActive : styles.filterChip}
          >
            <Text style={recentsFilter === filter ? styles.filterChipActiveText : styles.filterChipText}>{getFilterLabel(filter)}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredEvents}
        keyExtractor={item => item.name}
        renderItem={renderEvent}
        style={styles.eventsListFull}
        contentContainerStyle={styles.eventsContent}
        ListEmptyComponent={<Text style={styles.emptyText}>No items yet.</Text>}
      />
    </SafeAreaView>
  )
}
