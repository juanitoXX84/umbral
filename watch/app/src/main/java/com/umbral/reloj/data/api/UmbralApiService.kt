package com.umbral.reloj.data.api

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

interface UmbralApiService {
    @GET("api/me")
    suspend fun me(@Header("Authorization") token: String): Response<MeResponse>

    @POST("api/protection")
    suspend fun setProtection(
        @Header("Authorization") token: String,
        @Body body: ProtectionRequest
    ): Response<ProtectionResponse>

    @POST("api/events")
    suspend fun openEvent(
        @Header("Authorization") token: String,
        @Body body: EventRequest
    ): Response<EventResponse>

    @POST("api/events/{id}/raise")
    suspend fun raiseEvent(
        @Header("Authorization") token: String,
        @Path("id") id: String
    ): Response<EventResponse>
}

data class ProtectionRequest(val armed: Boolean)

data class ProtectionResponse(val home: Home?)

data class MeResponse(val user: User?, val home: Home?)

data class User(val id: String, val name: String)

data class Home(
    val name: String? = null,
    val protectionArmed: Boolean = false,
    val members: List<Member>? = null
)

data class Member(
    val userId: String,
    val name: String,
    val role: String? = null,
    val protectionArmed: Boolean = false
)

data class EventRequest(val type: String)

data class EventResponse(val event: Event?)

data class Event(val id: String, val status: String? = null)
