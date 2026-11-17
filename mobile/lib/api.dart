import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'models.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.unauthorized = false});
  final String message;

  /// The token is no longer valid: sign the person out.
  final bool unauthorized;

  @override
  String toString() => message;
}

/// Talks to the website's /api/mobile routes with the signed-in bearer token.
class Api {
  Api({this.token, http.Client? client}) : _client = client ?? http.Client();

  String? token;
  final http.Client _client;

  /// Called when the server rejects the token (password changed, account off).
  void Function()? onUnauthorized;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$apiBaseUrl/api/mobile$path').replace(queryParameters: query);

  Future<Map<String, dynamic>> _send(String method, String path, {Object? body, Map<String, String>? query}) async {
    final request = http.Request(method, _uri(path, query))
      ..headers['accept'] = 'application/json'
      ..headers['content-type'] = 'application/json';
    if (token != null) request.headers['authorization'] = 'Bearer $token';
    if (body != null) request.body = jsonEncode(body);

    http.Response response;
    try {
      response = await http.Response.fromStream(await _client.send(request).timeout(const Duration(seconds: 20)));
    } on SocketException {
      throw ApiException("Can't reach Arrival Desk. Check your internet connection.");
    } on TimeoutException {
      throw ApiException('Arrival Desk is taking too long to answer. Try again.');
    } on http.ClientException {
      throw ApiException("Can't reach Arrival Desk. Check your internet connection.");
    }

    Map<String, dynamic> data;
    try {
      final decoded = jsonDecode(response.body);
      data = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
    } catch (_) {
      data = {};
    }

    if (response.statusCode == 401 && token != null) {
      onUnauthorized?.call();
      throw ApiException(data['error'] as String? ?? 'Please sign in again.', unauthorized: true);
    }
    if (response.statusCode >= 400 || data['ok'] == false) {
      throw ApiException(data['error'] as String? ?? 'Something went wrong (${response.statusCode}).');
    }
    return data;
  }

  Future<(String token, AppUser user)> login(String email, String password) async {
    final data = await _send('POST', '/login', body: {'email': email.trim(), 'password': password});
    return (data['token'] as String, AppUser.fromJson(data['user'] as Map<String, dynamic>));
  }

  Future<Me> me() async => Me.fromJson(await _send('GET', '/me'));

  Future<GuestRange> guests({required String floorId, required String from, required String to}) async =>
      GuestRange.fromJson(await _send('GET', '/guests', query: {'floor': floorId, 'from': from, 'to': to}));

  Future<void> saveGuest(GuestInput input) => _send('POST', '/guests', body: input.toJson());

  Future<void> setStatus(String guestId, String status) => _send('PATCH', '/guests/$guestId', body: {'status': status});

  Future<void> deleteGuest(String guestId) => _send('DELETE', '/guests/$guestId');

  Future<void> registerDevice(String fcmToken) =>
      _send('POST', '/devices', body: {'token': fcmToken, 'platform': 'android'});

  Future<void> unregisterDevice(String fcmToken) => _send('DELETE', '/devices', body: {'token': fcmToken});

  Future<String> sendTestAlert() async {
    final data = await _send('POST', '/test-alert');
    return data['notice'] as String? ?? 'Test alert sent.';
  }
}
