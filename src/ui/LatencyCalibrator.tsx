import { useEffect, useRef, useState } from 'react'
import type { PlayedEvent } from '../judge/types'
import { medianOffset } from '../train/timing'

interface LatencyCalibratorProps {
  value: number
  onChange: (offsetMs: number) => void
  bind: (push: ((event: PlayedEvent) => void) | null) => void
}

/** Tap eight clicks. The median offset is subtracted from every later judgement. */
export function LatencyCalibrator({ value, onChange, bind }: LatencyCalibratorProps) {
  const [running, setRunning] = useState(false)
  const [count, setCount] = useState(0)
  const [flash, setFlash] = useState(false)
  const taps = useRef<number[]>([])
  const nextClick = useRef(0)

  useEffect(() => {
    if (!running) {
      bind(null)
      return
    }
    taps.current = []
    setCount(0)
    const beat = 1000
    nextClick.current = performance.now() + beat
    const timer = window.setInterval(() => {
      const now = performance.now()
      nextClick.current = now + beat
      setFlash(true)
      window.setTimeout(() => setFlash(false), 120)
      setCount((value) => {
        if (value + 1 >= 8) {
          window.clearInterval(timer)
          setRunning(false)
          if (taps.current.length >= 4) onChange(medianOffset(taps.current))
        }
        return value + 1
      })
    }, beat)
    bind((event) => {
      if (event.type !== 'on') return
      const offset = event.timeMs - (nextClick.current - beat)
      taps.current.push(offset)
    })
    return () => {
      window.clearInterval(timer)
      bind(null)
    }
  }, [running, bind, onChange])

  return (
    <div className="calibrator">
      <p>跟着闪动的拍子点 8 下。页面会记下你比拍子早或晚多少，并在练习和训练里扣掉。</p>
      <div className="omr-actions">
        <button type="button" className="button primary" onClick={() => setRunning(true)} disabled={running}>
          {running ? `第 ${count + 1} 拍` : '开始校准'}
        </button>
        <button
          type="button"
          className={flash ? 'calibrator-dot is-on' : 'calibrator-dot'}
          onClick={() => {
            if (!running) return
            taps.current.push(performance.now() - (nextClick.current - 1000))
          }}
        >
          点这里
        </button>
        <span className="device-note">当前偏移 {value} ms</span>
      </div>
    </div>
  )
}
