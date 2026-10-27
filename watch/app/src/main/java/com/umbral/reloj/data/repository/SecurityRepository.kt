package com.umbral.reloj.data.repository

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import com.umbral.reloj.data.api.EventRequest
import com.umbral.reloj.data.api.UmbralApiService
import com.umbral.reloj.data.api.Member
import com.umbral.reloj.data.api.ProtectionRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class HomeState(
    val userId: String?,
    val name: String,
    val armed: Boolean,
    val members: List<Member>
)

class SecurityRepository(context: Context) {
    private val TAG = "SecurityRepo"
    private val BASE_URL = "http://10.0.2.2:4000/"
    private val api: UmbralApiService
    val prefs: SharedPreferences

    init {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val retrofit = Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        api = retrofit.create(UmbralApiService::class.java)
    }

    fun getToken(): String? {
        val stored = prefs.getString(KEY_JWT, null) ?: return null
        return try {
            decrypt(stored)
        } catch (_: Exception) {
            clearToken()
            null
        }
    }

    fun saveToken(token: String) {
        prefs.edit().putString(KEY_JWT, encrypt(token)).apply()
    }

    fun clearToken() {
        prefs.edit().remove(KEY_JWT).apply()
    }

    class ApiError(message: String) : Exception(message)

    suspend fun loadHome(): Result<HomeState> = call { auth ->
        val body = api.me(auth).checked()
        val home = body.home ?: throw ApiError("Entra a un hogar desde el teléfono")
        HomeState(
            userId = body.user?.id,
            name = home.name ?: "Tu hogar",
            armed = home.protectionArmed,
            members = home.members.orEmpty()
        )
    }

    suspend fun setProtection(armed: Boolean): Result<Boolean> = call { auth ->
        api.setProtection(auth, ProtectionRequest(armed)).checked().home?.protectionArmed ?: armed
    }

    suspend fun sendHelp(): Result<Unit> = call { auth ->
        val event = api.openEvent(auth, EventRequest("sos")).checked().event
            ?: throw ApiError("No se pudo avisar")
        api.raiseEvent(auth, event.id).checked()
        Unit
    }

    private suspend fun <T> call(block: suspend (String) -> T): Result<T> = withContext(Dispatchers.IO) {
        val token = getToken() ?: return@withContext Result.failure(ApiError("Sin sesión"))
        try {
            Result.success(block("Bearer $token"))
        } catch (e: ApiError) {
            Result.failure(e)
        } catch (_: Exception) {
            Result.failure(ApiError("Sin conexión"))
        }
    }

    private fun <T> Response<T>.checked(): T {
        if (code() == 401) {
            clearToken()
            throw ApiError("La sesión venció")
        }
        return body()?.takeIf { isSuccessful } ?: throw ApiError("Error del servidor")
    }

    /** Called from TokenSyncService when the phone publishes `/session`. */
    fun handleTokenSync(token: String) {
        Log.d(TAG, "Session synced from phone")
        saveToken(token)
    }

    /** Called from TokenSyncService when the phone deletes `/session` on sign-out. */
    fun handleSessionCleared() {
        Log.d(TAG, "Session removed by phone")
        clearToken()
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv + sealed, Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String {
        val bytes = Base64.decode(stored, Base64.NO_WRAP)
        val iv = bytes.copyOfRange(0, IV_SIZE)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        }
        return String(cipher.doFinal(bytes, IV_SIZE, bytes.size - IV_SIZE), Charsets.UTF_8)
    }

    companion object {
        const val KEY_JWT = "jwt"
        private const val PREFS = "umbral_prefs"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "umbral_session"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_SIZE = 12
    }
}
