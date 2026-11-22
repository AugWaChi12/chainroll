'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus =
  | 'idle'
  | 'starting'
  | 'live'
  | 'denied' // user or OS blocked access
  | 'no-camera' // no device found
  | 'insecure' // getUserMedia needs https (or localhost)
  | 'unsupported'
  | 'error'

export type Facing = 'environment' | 'user'

/** Owns the getUserMedia stream lifecycle. The <video> element is created here, never shown. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [facing, setFacing] = useState<Facing>('environment')
  const [canFlip, setCanFlip] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(
    async (want: Facing) => {
      if (typeof window === 'undefined') return
      if (!window.isSecureContext) return setStatus('insecure')
      if (!navigator.mediaDevices?.getUserMedia) return setStatus('unsupported')

      setStatus('starting')
      stop()
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: want },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
        })
        streamRef.current = stream
        let video = videoRef.current
        if (!video) {
          video = document.createElement('video')
          video.muted = true
          video.playsInline = true
          video.setAttribute('playsinline', '')
          videoRef.current = video
        }
        video.srcObject = stream
        await video.play()
        setStatus('live')

        const devices = await navigator.mediaDevices.enumerateDevices()
        setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1)
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied')
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('no-camera')
        else setStatus('error')
      }
    },
    [stop],
  )

  useEffect(() => {
    // Starting the stream is a side effect that syncs React with the camera hardware.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start(facing)
    return stop
  }, [facing, start, stop])

  // release the camera when the tab is hidden, resume when visible again
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stop()
      else if (status === 'live' || status === 'starting') void start(facing)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [facing, start, status, stop])

  return {
    video: videoRef,
    status,
    facing,
    canFlip,
    flip: () => setFacing((f) => (f === 'environment' ? 'user' : 'environment')),
    retry: () => void start(facing),
  }
}
