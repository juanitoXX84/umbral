package com.umbral.reloj.presentation

import android.content.SharedPreferences
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.umbral.reloj.data.repository.HomeState
import com.umbral.reloj.data.repository.SecurityRepository
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private var resumes by mutableIntStateOf(0)

    override fun onResume() {
        super.onResume()
        resumes++
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repository = SecurityRepository(this)

        setContent {
            var token by remember { mutableStateOf(repository.getToken()) }
            var home by remember { mutableStateOf<HomeState?>(null) }
            var status by remember { mutableStateOf<String?>(null) }
            var busy by remember { mutableStateOf(false) }
            var help by remember { mutableStateOf(HelpState.Idle) }
            val scope = rememberCoroutineScope()

            DisposableEffect(Unit) {
                val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                    if (key == SecurityRepository.KEY_JWT) token = repository.getToken()
                }
                repository.prefs.registerOnSharedPreferenceChangeListener(listener)
                onDispose { repository.prefs.unregisterOnSharedPreferenceChangeListener(listener) }
            }

            LaunchedEffect(token, resumes) {
                if (token == null) {
                    home = null
                    return@LaunchedEffect
                }
                repository.loadHome()
                    .onSuccess { home = it; status = null }
                    .onFailure { status = it.message }
            }

            UmbralApp(
                linked = token != null,
                home = home,
                status = status,
                busy = busy,
                help = help,
                onToggle = {
                    val current = home ?: return@UmbralApp
                    busy = true
                    scope.launch {
                        repository.setProtection(!current.armed)
                            .onSuccess { armed ->
                                home = current.copy(armed = armed)
                                status = null
                                buzz(if (armed) 80 else 40)
                            }
                            .onFailure { status = it.message }
                        busy = false
                    }
                },
                onHelpStart = {
                    help = HelpState.Counting
                    buzz(60)
                },
                onHelpCancel = { help = HelpState.Idle },
                onHelpFire = {
                    help = HelpState.Sending
                    scope.launch {
                        help = repository.sendHelp().fold(
                            onSuccess = { buzz(400); HelpState.Sent },
                            onFailure = { status = it.message; HelpState.Failed }
                        )
                    }
                },
                onHelpReset = { help = HelpState.Idle }
            )
        }
    }

    private fun buzz(millis: Long) {
        val vibrator = getSystemService(Vibrator::class.java) ?: return
        vibrator.vibrate(VibrationEffect.createOneShot(millis, VibrationEffect.DEFAULT_AMPLITUDE))
    }
}
