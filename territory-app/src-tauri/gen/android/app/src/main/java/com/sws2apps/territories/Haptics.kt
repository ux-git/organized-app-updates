package com.sws2apps.territories

import android.content.Context
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.os.VibrationEffect.Composition.PRIMITIVE_CLICK as CLICK
import android.os.VibrationEffect.Composition.PRIMITIVE_QUICK_FALL as FALL
import android.os.VibrationEffect.Composition.PRIMITIVE_QUICK_RISE as RISE
import android.os.VibrationEffect.Composition.PRIMITIVE_SLOW_RISE as SWELL
import android.os.VibrationEffect.Composition.PRIMITIVE_TICK as TICK

/**
 * The sync's own vibrations, built from the phone's haptic primitives where
 * it has them (Android 11+ with a good motor), else from amplitude steps.
 * They follow the system's touch feedback setting on Android 13+.
 */
object Haptics {
  /** One primitive: which, how strong (0..1), and the pause before it. */
  private class Step(val primitive: Int, val scale: Float, val delay: Int = 0)

  private class Pattern(val steps: List<Step>, val timings: LongArray, val amplitudes: IntArray)

  private fun swells(vararg peaks: Int): Pair<LongArray, IntArray> {
    val timings = mutableListOf(0L)
    val amplitudes = mutableListOf(0)
    for (peak in peaks) {
      for (level in listOf(0.25, 0.5, 0.75, 1.0, 0.6, 0.2)) {
        timings += 30L
        amplitudes += (peak * level).toInt()
      }
      timings += 70L
      amplitudes += 0
    }
    return timings.toLongArray() to amplitudes.toIntArray()
  }

  private val PATTERNS: Map<String, Pattern> = buildMap {
    // NFC: ripples growing as if a wave went through the phone
    val (waveT, waveA) = swells(50, 100, 160)
    put(
      "wave",
      Pattern(
        listOf(
          Step(SWELL, 0.25f), Step(FALL, 0.2f),
          Step(SWELL, 0.45f, 60), Step(FALL, 0.35f),
          Step(SWELL, 0.7f, 60), Step(FALL, 0.5f),
        ),
        waveT, waveA
      )
    )
    // the phones touched: a firm double knock
    put(
      "contact",
      Pattern(
        listOf(Step(CLICK, 1f), Step(CLICK, 0.8f, 70)),
        longArrayOf(0, 18, 70, 18), intArrayOf(0, 255, 0, 200)
      )
    )
    // a phone showed up nearby
    put(
      "found",
      Pattern(
        listOf(Step(TICK, 0.5f), Step(TICK, 0.9f, 90)),
        longArrayOf(0, 12, 90, 14), intArrayOf(0, 120, 0, 220)
      )
    )
    // the code to compare is on screen
    put(
      "code",
      Pattern(
        listOf(Step(RISE, 0.6f), Step(CLICK, 0.7f, 20)),
        longArrayOf(0, 60, 20, 20), intArrayOf(0, 110, 0, 220)
      )
    )
    // a sync starts
    put(
      "start",
      Pattern(listOf(Step(SWELL, 0.5f)), longArrayOf(0, 40, 40, 40), intArrayOf(0, 60, 120, 60))
    )
    // paired: ta-da-daa
    put(
      "paired",
      Pattern(
        listOf(Step(RISE, 0.5f), Step(CLICK, 0.9f, 30), Step(CLICK, 0.6f, 110), Step(CLICK, 1f, 90)),
        longArrayOf(0, 50, 30, 20, 110, 16, 90, 30),
        intArrayOf(0, 90, 0, 230, 0, 150, 0, 255)
      )
    )
    // synced: a light run up and a click
    put(
      "synced",
      Pattern(
        listOf(Step(TICK, 0.4f), Step(TICK, 0.6f, 60), Step(TICK, 0.8f, 60), Step(CLICK, 1f, 80)),
        longArrayOf(0, 10, 60, 12, 60, 14, 80, 24),
        intArrayOf(0, 90, 0, 150, 0, 200, 0, 255)
      )
    )
    // something didn't work: two low knocks
    put(
      "error",
      Pattern(
        listOf(Step(CLICK, 0.9f), Step(FALL, 0.8f, 120)),
        longArrayOf(0, 40, 120, 60), intArrayOf(0, 200, 0, 140)
      )
    )
    // removing something: a short drop
    put(
      "remove",
      Pattern(listOf(Step(FALL, 0.9f)), longArrayOf(0, 30, 30, 30), intArrayOf(0, 200, 120, 50))
    )
  }

  private fun vibrator(context: Context): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

  fun has(name: String) = PATTERNS.containsKey(name)

  fun play(context: Context, name: String): Boolean {
    val pattern = PATTERNS[name] ?: return false
    val vibrator = vibrator(context)?.takeIf { it.hasVibrator() } ?: return false
    runCatching {
      val effect = effect(vibrator, pattern) ?: return false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
      } else {
        vibrator.vibrate(effect)
      }
    }
    return true
  }

  private fun effect(vibrator: Vibrator, pattern: Pattern): VibrationEffect? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val primitives = pattern.steps.map { it.primitive }.distinct().toIntArray()
      if (vibrator.areAllPrimitivesSupported(*primitives)) {
        val composition = VibrationEffect.startComposition()
        pattern.steps.forEach { composition.addPrimitive(it.primitive, it.scale, it.delay) }
        return composition.compose()
      }
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
    return if (vibrator.hasAmplitudeControl()) {
      VibrationEffect.createWaveform(pattern.timings, pattern.amplitudes, -1)
    } else {
      // on/off only: keep the rhythm
      val timings = mutableListOf<Long>()
      var on = false
      var length = 0L
      pattern.timings.forEachIndexed { i, time ->
        if ((pattern.amplitudes[i] > 0) == on) {
          length += time
        } else {
          timings += length
          length = time
          on = !on
        }
      }
      timings += length
      VibrationEffect.createWaveform(timings.toLongArray(), -1)
    }
  }
}
