import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:realtime_client/realtime_client.dart';

import 'session.dart';

/// Reloads guests the moment anyone changes them, using the same live channel
/// as the website. The signal carries no guest details, and the 30-second check
/// in GuestLoader stays as the backup if this connection drops.
class LiveUpdates {
  RealtimeClient? _client;
  Timer? _debounce;
  String? _url;
  String? _key;

  /// The server tells the app where to connect. Null turns live updates off.
  void configure(String? url, String? anonKey) {
    if (url == _url && anonKey == _key) return start();
    _url = url;
    _key = anonKey;
    stop();
    start();
  }

  void start() {
    final url = _url;
    final key = _key;
    if (url == null || key == null || _client != null) return;
    try {
      final socket = '${url.replaceFirst(RegExp(r'^http'), 'ws').replaceFirst(RegExp(r'/+$'), '')}/realtime/v1';
      final client = RealtimeClient(socket, params: {'apikey': key});
      _client = client;
      client.channel('reception-board').onBroadcast(event: 'guests-changed', callback: (_) => _changed()).subscribe((
        status,
        _,
      ) {
        // Connected or reconnected: catch anything missed while offline.
        if (status == RealtimeSubscribeStatus.subscribed) _changed();
      });
    } catch (error) {
      debugPrint('Live updates unavailable: $error');
      _client = null;
    }
  }

  /// Several quick changes become one reload.
  void _changed() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), requestRefresh);
  }

  void stop() {
    _debounce?.cancel();
    final client = _client;
    _client = null;
    if (client == null) return;
    unawaited(() async {
      try {
        await client.removeAllChannels();
        await client.disconnect();
      } catch (_) {}
    }());
  }
}

final liveUpdates = LiveUpdates();
