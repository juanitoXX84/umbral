package com.umbral.reloj.service

import android.util.Log
import com.umbral.reloj.data.repository.SecurityRepository
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

class TokenSyncService : WearableListenerService() {
    private val tag = "TokenSyncService"

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        super.onDataChanged(dataEvents)
        dataEvents.use { buffer ->
            for (event in buffer) {
                val item = event.dataItem
                if (item.uri.path != SESSION_PATH) continue
                when (event.type) {
                    DataEvent.TYPE_CHANGED -> {
                        val token = DataMapItem.fromDataItem(item).dataMap.getString(KEY_TOKEN)
                        if (token.isNullOrBlank()) continue
                        Log.d(tag, "Session token received from phone")
                        SecurityRepository(this).handleTokenSync(token)
                    }
                    DataEvent.TYPE_DELETED -> SecurityRepository(this).handleSessionCleared()
                }
            }
        }
    }

    private companion object {
        const val SESSION_PATH = "/session"
        const val KEY_TOKEN = "token"
    }
}
