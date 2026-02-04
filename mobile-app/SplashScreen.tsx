import React, { useEffect, useRef } from 'react'
import { View, Text, Image, StyleSheet, Animated, Dimensions } from 'react-native'

const { width, height } = Dimensions.get('window')

export default function SplashScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      delay: 500,
      useNativeDriver: true,
    }).start()
  }, [fadeAnim])

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('./assets/spicam_icon_1024.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.appName}>sPiCam</Text>
        <Animated.Text style={[styles.tagline, { opacity: fadeAnim }]}>
          Analog looks. Digital vigilance.
        </Animated.Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: Math.min(width * 0.4, 200),
    height: Math.min(width * 0.4, 200),
    marginBottom: 32,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#F4F1EC',
    letterSpacing: 1,
    marginBottom: 16,
  },
  tagline: {
    fontSize: 16,
    color: '#F4F1EC',
    letterSpacing: 0.5,
    textAlign: 'center',
    opacity: 0.85,
  },
})
