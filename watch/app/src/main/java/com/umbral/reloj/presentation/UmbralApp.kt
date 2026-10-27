package com.umbral.reloj.presentation

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Text
import com.umbral.reloj.data.repository.HomeState
import kotlinx.coroutines.delay
import kotlin.math.ceil

private val Bg = Color(0xFF0E0B09)
private val Surface = Color(0xFF1A1512)
private val Line = Color(0xFF3A3029)
private val Amber = Color(0xFFFFA94D)
private val Ink = Color(0xFF1C1006)
private val TextMain = Color(0xFFF6EFE7)
private val Muted = Color(0xFFB8A796)
private val Danger = Color(0xFFFF5A5F)
private val Sage = Color(0xFF8AD99B)

private const val HELP_SECONDS = 5

enum class HelpState { Idle, Counting, Sending, Sent, Failed }

@Composable
fun UmbralApp(
    linked: Boolean,
    home: HomeState?,
    status: String?,
    busy: Boolean,
    help: HelpState,
    onToggle: () -> Unit,
    onHelpStart: () -> Unit,
    onHelpCancel: () -> Unit,
    onHelpFire: () -> Unit,
    onHelpReset: () -> Unit
) {
    Box(Modifier.fillMaxSize().background(Bg), contentAlignment = Alignment.Center) {
        if (!linked) {
            LinkScreen()
            return@Box
        }

        val countdown = remember { Animatable(1f) }
        val fire by rememberUpdatedState(onHelpFire)
        val reset by rememberUpdatedState(onHelpReset)
        LaunchedEffect(help) {
            when (help) {
                HelpState.Counting -> {
                    countdown.snapTo(1f)
                    countdown.animateTo(0f, tween(HELP_SECONDS * 1000, easing = LinearEasing))
                    fire()
                }
                HelpState.Sent -> {
                    delay(6000)
                    reset()
                }
                else -> Unit
            }
        }

        val pager = rememberPagerState(pageCount = { 3 })
        HorizontalPager(
            state = pager,
            userScrollEnabled = help != HelpState.Counting && help != HelpState.Sending,
            modifier = Modifier.fillMaxSize()
        ) { page ->
            when (page) {
                0 -> ProtectionPage(home, status, busy, onToggle)
                1 -> HelpPage(help, countdown.value, status, onHelpStart, onHelpCancel, onHelpReset)
                else -> HomePage(home, status)
            }
        }
        PageDots(
            current = pager.currentPage,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp)
        )
    }
}

@Composable
private fun LinkScreen() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(horizontal = 28.dp)
    ) {
        Eyebrow("Umbral")
        Spacer(Modifier.height(10.dp))
        Text(
            "Vincula tu teléfono",
            color = TextMain,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "En el teléfono abre Umbral, ve a Perfil y toca Vincular reloj.",
            color = Muted,
            fontSize = 11.sp,
            lineHeight = 14.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun ProtectionPage(home: HomeState?, status: String?, busy: Boolean, onToggle: () -> Unit) {
    val armed = home?.armed == true
    val fill by animateColorAsState(if (armed) Amber else Surface, label = "fill")
    val ring by animateColorAsState(if (armed) Amber.copy(alpha = 0.3f) else Line, label = "ring")

    PageColumn {
        Eyebrow(home?.name ?: "Umbral")
        Spacer(Modifier.height(10.dp))
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(98.dp)
                .alpha(if (busy || home == null) 0.55f else 1f)
                .border(5.dp, ring, CircleShape)
                .padding(8.dp)
                .background(fill, CircleShape)
                .clickable(enabled = !busy && home != null, onClick = onToggle)
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    if (armed) "Activa" else "Apagada",
                    color = if (armed) Ink else TextMain,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "Protección",
                    color = if (armed) Ink.copy(alpha = 0.7f) else Muted,
                    fontSize = 10.sp
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Caption(
            text = status ?: when {
                home == null -> "Conectando…"
                busy -> "Guardando…"
                armed -> "Tu casa te está cuidando"
                else -> "Toca para activar"
            },
            alert = status != null
        )
    }
}

@Composable
private fun HelpPage(
    help: HelpState,
    progress: Float,
    status: String?,
    onStart: () -> Unit,
    onCancel: () -> Unit,
    onReset: () -> Unit
) {
    val start by rememberUpdatedState(onStart)

    PageColumn {
        Eyebrow("Ayuda")
        Spacer(Modifier.height(10.dp))
        when (help) {
            HelpState.Idle -> {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(98.dp)
                        .border(5.dp, Danger.copy(alpha = 0.3f), CircleShape)
                        .padding(8.dp)
                        .background(Danger, CircleShape)
                        .pointerInput(Unit) { detectTapGestures(onLongPress = { start() }) }
                ) {
                    Text("SOS", color = TextMain, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(10.dp))
                Caption("Mantén presionado")
            }
            HelpState.Counting -> {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(98.dp).clickable(onClick = onCancel)
                ) {
                    Canvas(Modifier.fillMaxSize()) {
                        val stroke = 6.dp.toPx()
                        drawCircle(Surface, radius = size.minDimension / 2 - stroke / 2, style = Stroke(stroke))
                        drawArc(
                            color = Danger,
                            startAngle = -90f,
                            sweepAngle = 360f * progress,
                            useCenter = false,
                            style = Stroke(stroke, cap = StrokeCap.Round)
                        )
                    }
                    Text(
                        "${ceil(progress * HELP_SECONDS).toInt().coerceAtLeast(1)}",
                        color = TextMain,
                        fontSize = 34.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(Modifier.height(10.dp))
                Caption("Toca para cancelar")
            }
            HelpState.Sending -> {
                StateCircle(Surface, "…", TextMain)
                Spacer(Modifier.height(10.dp))
                Caption("Avisando a tu casa")
            }
            HelpState.Sent -> {
                StateCircle(Sage, "✓", Ink, Modifier.clickable(onClick = onReset))
                Spacer(Modifier.height(10.dp))
                Caption("Tu casa recibió el aviso")
            }
            HelpState.Failed -> {
                StateCircle(Surface, "!", Danger, Modifier.clickable(onClick = onReset))
                Spacer(Modifier.height(10.dp))
                Caption(status ?: "No se envió. Toca para reintentar", alert = true)
            }
        }
    }
}

@Composable
private fun HomePage(home: HomeState?, status: String?) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 26.dp, end = 26.dp, top = 30.dp, bottom = 36.dp)
    ) {
        Eyebrow("Casa")
        Spacer(Modifier.height(4.dp))
        Text(
            home?.name ?: "…",
            color = TextMain,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(10.dp))
        if (home == null) {
            Caption(status ?: "Conectando…", alert = status != null)
            return@Column
        }
        val guarded = home.members.count { it.protectionArmed }
        Caption("$guarded de ${home.members.size} con protección")
        Spacer(Modifier.height(8.dp))
        home.members.forEach { member ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 3.dp)
                    .background(Surface, RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                Box(
                    Modifier
                        .size(8.dp)
                        .background(if (member.protectionArmed) Amber else Line, CircleShape)
                )
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        member.name + if (member.userId == home.userId) " (tú)" else "",
                        color = TextMain,
                        fontSize = 12.sp,
                        maxLines = 1
                    )
                    Text(
                        if (member.role == "central") "Central" else "Miembro",
                        color = Muted,
                        fontSize = 9.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun PageColumn(content: @Composable () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, bottom = 10.dp)
    ) { content() }
}

@Composable
private fun StateCircle(color: Color, glyph: String, glyphColor: Color, modifier: Modifier = Modifier) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.size(98.dp).padding(8.dp).background(color, CircleShape)
    ) {
        Text(glyph, color = glyphColor, fontSize = 30.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun Eyebrow(text: String) {
    Text(
        text.uppercase(),
        color = Amber,
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.5.sp,
        maxLines = 1
    )
}

@Composable
private fun Caption(text: String, alert: Boolean = false) {
    Text(
        text,
        color = if (alert) Danger else Muted,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        textAlign = TextAlign.Center
    )
}

@Composable
private fun PageDots(current: Int, modifier: Modifier = Modifier) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = modifier) {
        repeat(3) { index ->
            Box(
                Modifier
                    .height(5.dp)
                    .width(if (index == current) 12.dp else 5.dp)
                    .background(if (index == current) Amber else Line, CircleShape)
            )
        }
    }
}
