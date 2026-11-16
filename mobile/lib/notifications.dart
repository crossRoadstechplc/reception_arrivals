import 'dart:async';
import 'dart:ui' show Color;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'session.dart';

/// Must match ARRIVAL_CHANNEL_ID in the website's lib/fcm.ts.
const arrivalChannelId = 'arrivals';

/// Runs when an alert arrives while the app is closed. Android shows the
/// notification itself (from the message's notification part), so there's
/// nothing to do here; the handler just has to exist.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {}

enum AlertState {
  /// google-services.json isn't in the app yet.
  notSetUp,

  /// The server has no Firebase key yet.
  serverNotSetUp,
  off,
  blocked,
  on,
}

/// "Your guest has arrived" alerts on this phone, through Firebase Cloud Messaging.
///
/// Uses FCM registration tokens (getToken/onTokenRefresh). firebase_messaging 17
/// marks these deprecated in favour of installation IDs, but the server's
/// firebase-admin sends to registration tokens, so we keep them on purpose.
class Alerts extends ChangeNotifier {
  static const _enabledKey = 'alerts-enabled';

  final _local = FlutterLocalNotificationsPlugin();
  bool _firebaseReady = false;
  String? _token;
  StreamSubscription<String>? _tokenSub;
  AlertState state = AlertState.off;
  Session? _session;

  bool get firebaseReady => _firebaseReady;

  /// Call once at start-up, before runApp.
  Future<void> init() async {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
      _firebaseReady = true;
    } catch (error) {
      debugPrint('Firebase is not configured (add android/app/google-services.json): $error');
      _firebaseReady = false;
    }

    await _local.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('ic_stat_arrival')),
      onDidReceiveNotificationResponse: (_) => requestRefresh(),
    );
    await _android?.createNotificationChannel(
      AndroidNotificationChannel(
        arrivalChannelId,
        'Guest arrivals',
        description: 'When reception checks in one of your guests.',
        importance: Importance.max,
        sound: const RawResourceAndroidNotificationSound('arrival'),
        vibrationPattern: Int64List.fromList([0, 120, 80, 120, 80, 320]),
        enableLights: true,
        ledColor: const Color.fromARGB(255, 216, 90, 42),
      ),
    );

    if (!_firebaseReady) {
      state = AlertState.notSetUp;
      return;
    }

    // While the app is open Android doesn't show Firebase alerts by itself: show it ourselves.
    FirebaseMessaging.onMessage.listen((message) {
      requestRefresh();
      final n = message.notification;
      if (n == null) return;
      _local.show(
        id: message.data['tag']?.hashCode ?? DateTime.now().millisecondsSinceEpoch ~/ 1000,
        title: n.title,
        body: n.body,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            arrivalChannelId,
            'Guest arrivals',
            importance: Importance.max,
            priority: Priority.max,
            icon: 'ic_stat_arrival',
            color: const Color.fromARGB(255, 216, 90, 42),
            sound: const RawResourceAndroidNotificationSound('arrival'),
            category: AndroidNotificationCategory.message,
            visibility: NotificationVisibility.public,
          ),
        ),
      );
    });
    // Tapping an alert opens the app: make sure the list is fresh.
    FirebaseMessaging.onMessageOpenedApp.listen((_) => requestRefresh());
  }

  AndroidFlutterLocalNotificationsPlugin? get _android =>
      _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

  /// After sign-in: register this phone if alerts are (or should be) on.
  Future<void> attach(Session session) async {
    _session = session;
    await _refreshState();
    final prefs = await SharedPreferences.getInstance();
    final wanted = prefs.getBool(_enabledKey) ?? true; // on by default for a new sign-in
    if (wanted && state != AlertState.notSetUp && state != AlertState.serverNotSetUp) {
      await turnOn(ask: false);
    }
  }

  /// Before sign-out: stop alerts for this person on this phone.
  Future<void> detach(Session session) async {
    final token = _token;
    if (_firebaseReady && token != null) {
      try {
        await session.api.unregisterDevice(token);
      } catch (_) {}
      try {
        // ignore: deprecated_member_use
        await FirebaseMessaging.instance.deleteToken();
      } catch (_) {}
    }
    _token = null;
    await _tokenSub?.cancel();
    _tokenSub = null;
    _session = null;
  }

  Future<void> _refreshState() async {
    if (!_firebaseReady) {
      state = AlertState.notSetUp;
    } else if (_session != null && !_session!.alertsAvailable) {
      state = AlertState.serverNotSetUp;
    } else if (await _android?.areNotificationsEnabled() == false) {
      state = AlertState.blocked;
    } else {
      final prefs = await SharedPreferences.getInstance();
      state = (prefs.getBool(_enabledKey) ?? true) && _token != null ? AlertState.on : AlertState.off;
    }
    notifyListeners();
  }

  /// Ask for permission (Android 13+), get this phone's Firebase token and send it to the server.
  /// Returns an error message, or null when alerts are on.
  Future<String?> turnOn({bool ask = true}) async {
    final session = _session;
    if (!_firebaseReady || session == null) return 'Alerts aren’t set up in this build of the app.';
    try {
      final granted = await _android?.requestNotificationsPermission() ?? true;
      if (!granted) {
        state = AlertState.blocked;
        notifyListeners();
        return 'Notifications are blocked. Allow them in the phone’s settings for Arrival Desk.';
      }
      // ignore: deprecated_member_use
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return 'Couldn’t get an alert address for this phone. Try again.';
      await session.api.registerDevice(token);
      _token = token;
      await _tokenSub?.cancel();
      // ignore: deprecated_member_use
      _tokenSub = FirebaseMessaging.instance.onTokenRefresh.listen((fresh) {
        _token = fresh;
        _session?.api.registerDevice(fresh).catchError((_) {});
      });
      (await SharedPreferences.getInstance()).setBool(_enabledKey, true);
      await _refreshState();
      return null;
    } catch (error) {
      await _refreshState();
      return ask ? error.toString() : null;
    }
  }

  Future<void> turnOff() async {
    final session = _session;
    final token = _token;
    (await SharedPreferences.getInstance()).setBool(_enabledKey, false);
    if (session != null && token != null) {
      try {
        await session.api.unregisterDevice(token);
      } catch (_) {}
    }
    _token = null;
    await _tokenSub?.cancel();
    _tokenSub = null;
    await _refreshState();
  }

  /// Re-check after the person comes back from the phone's settings.
  Future<void> recheck() => _refreshState();
}

final alerts = Alerts();
