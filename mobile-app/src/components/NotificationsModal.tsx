import React from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { styles } from '../styles/appStyles'

type NotificationItem = {
  message: string
  kind?: string
  timestamp: string
}

type Props = {
  visible: boolean
  notifications: NotificationItem[]
  notificationsUpdatedAt: Date | null
  onRefresh: () => void
  onClose: () => void
}

export default function NotificationsModal({
  visible,
  notifications,
  notificationsUpdatedAt,
  onRefresh,
  onClose,
}: Readonly<Props>) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.modalContainer}>
        <View style={[styles.sectionHeader, { padding: 20, paddingBottom: 0 }]}>
          <Text style={styles.modalTitle}>Notifications</Text>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <Pressable onPress={onRefresh}>
              <Text style={styles.link}>Refresh</Text>
            </Pressable>
            <Pressable onPress={onClose}>
              <Text style={styles.link}>Done</Text>
            </Pressable>
          </View>
        </View>
        <Text style={[styles.notificationsMeta, { paddingHorizontal: 20, paddingTop: 8 }]}>
          {notificationsUpdatedAt ? `Last updated ${notificationsUpdatedAt.toLocaleString()}` : 'Not loaded yet'}
        </Text>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 8 }}>
          {notifications.length > 0 ? (
            notifications.map(item => (
              <View key={`${item.timestamp}-${item.message}`} style={styles.eventNav}>
                <Text style={styles.eventTime}>{new Date(item.timestamp).toLocaleString()}</Text>
                <Text style={styles.eventNavText}>{item.message}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No notifications yet.</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}
