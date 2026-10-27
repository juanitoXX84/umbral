package expo.modules.umbralwearsync

import android.content.Context
import android.net.Uri
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.tasks.await

private const val SESSION_PATH = "/session"
private const val KEY_TOKEN = "token"
private const val KEY_SENT_AT = "sentAt"

class UmbralWearSyncModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("UmbralWearSync")

    AsyncFunction("sendSession") Coroutine { token: String ->
      try {
        val watches = Wearable.getNodeClient(context).connectedNodes.await().size
        val request = PutDataMapRequest.create(SESSION_PATH).apply {
          dataMap.putString(KEY_TOKEN, token)
          // Data Layer only notifies listeners when the item changes.
          dataMap.putLong(KEY_SENT_AT, System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(context).putDataItem(request).await()
        if (watches > 0) "sent" else "queued"
      } catch (_: ApiException) {
        "unavailable"
      }
    }

    AsyncFunction("clearSession") Coroutine { ->
      try {
        val uri = Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(SESSION_PATH).build()
        Wearable.getDataClient(context).deleteDataItems(uri).await()
        "cleared"
      } catch (_: ApiException) {
        "unavailable"
      }
    }
  }
}
