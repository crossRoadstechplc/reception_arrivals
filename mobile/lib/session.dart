import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'live_updates.dart';
import 'models.dart';

/// Who is signed in, their floors, and the floor they're looking at.
class Session extends ChangeNotifier {
  Session() {
    api.onUnauthorized = () => signOut(expired: true);
  }

  static const _tokenKey = 'token';
  static const _userKey = 'user';
  static const _floorKey = 'floor';

  final api = Api();
  final _secure = const FlutterSecureStorage();

  AppUser? user;
  List<Floor> floors = [];
  String? floorId;
  bool alertsAvailable = false;

  /// Office "today" from the server (never the phone's clock).
  String? today;
  bool ready = false;
  DateTime? _renewedAt;

  /// Set when the server ended the session, to explain why on the sign-in screen.
  String? signedOutReason;

  bool get signedIn => api.token != null && user != null;
  Floor? get floor => floors.where((f) => f.id == floorId).firstOrNull ?? floors.firstOrNull;

  /// Called after sign-in and sign-out (alerts register/unregister this phone).
  Future<void> Function(Session session)? onSignedIn;
  Future<void> Function(Session session)? onSigningOut;

  Future<void> restore() async {
    try {
      final token = await _secure.read(key: _tokenKey);
      final userJson = await _secure.read(key: _userKey);
      if (token != null && userJson != null) {
        api.token = token;
        user = AppUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
        floorId = (await SharedPreferences.getInstance()).getString(_floorKey);
      }
    } catch (_) {
      // Storage unreadable (e.g. app data restored to a new phone): start signed out.
      api.token = null;
      user = null;
    }
    if (signedIn) {
      // Load floors while the splash is showing (briefly; offline we carry on
      // and retry from the home screen), then set up alerts in the background.
      try {
        await refreshMe().timeout(const Duration(seconds: 8));
      } catch (_) {}
      onSignedIn?.call(this);
    }
    ready = true;
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    final (token, signedInUser) = await api.login(email, password);
    await _finishSignIn(token, signedInUser);
  }

  Future<void> signInWithCode(String email, String code) async {
    final (token, signedInUser) = await api.verifyLoginCode(email, code);
    await _finishSignIn(token, signedInUser);
  }

  Future<void> _finishSignIn(String token, AppUser signedInUser) async {
    api.token = token;
    user = signedInUser;
    signedOutReason = null;
    await _secure.write(key: _tokenKey, value: token);
    await _secure.write(key: _userKey, value: jsonEncode(signedInUser.toJson()));
    await refreshMe();
    notifyListeners();
    await onSignedIn?.call(this);
  }

  Future<void> refreshMe() async {
    final tokenUsed = api.token;
    final me = await api.me();
    if (api.token != tokenUsed) return; // signed out or switched account meanwhile
    _renewedAt = DateTime.now();
    final renewed = me.token;
    if (renewed != null) {
      api.token = renewed;
      try {
        await _secure.write(key: _tokenKey, value: renewed);
      } catch (_) {
        // Keep going: the saved token is still valid until it expires.
      }
    }
    user = me.user;
    floors = me.floors;
    alertsAvailable = me.alertsAvailable;
    today = me.today;
    liveUpdates.configure(me.realtimeUrl, me.realtimeKey);
    if (floorId == null || !floors.any((f) => f.id == floorId)) floorId = floors.firstOrNull?.id;
    notifyListeners();
  }

  /// Renews the sign-in when the app comes back to the front (at most every 12 hours).
  void renewIfDue() {
    final last = _renewedAt;
    if (!signedIn || (last != null && DateTime.now().difference(last).abs() < const Duration(hours: 12))) return;
    refreshMe().catchError((_) {});
  }

  Future<void> selectFloor(String id) async {
    floorId = id;
    notifyListeners();
    (await SharedPreferences.getInstance()).setString(_floorKey, id);
  }

  Future<void> signOut({bool expired = false}) async {
    if (!signedIn) return;
    try {
      await onSigningOut?.call(this);
    } catch (_) {}
    liveUpdates.configure(null, null);
    api.token = null;
    user = null;
    floors = [];
    signedOutReason = expired ? 'You were signed out. Please sign in again.' : null;
    await _secure.delete(key: _tokenKey);
    await _secure.delete(key: _userKey);
    notifyListeners();
  }
}

/// Bumped when guests may have changed (an alert came in, the app came back
/// to the front), so open screens reload.
final refreshSignal = ValueNotifier<int>(0);
void requestRefresh() => refreshSignal.value++;

/// Bumped when someone comes back to the app after being away, so screens return to today.
final appReturned = ValueNotifier<int>(0);

/// Bumped when the Guests tab is tapped, which always opens today.
final guestsTabTapped = ValueNotifier<int>(0);

/// The last time anyone touched the screen.
DateTime lastTouch = DateTime.now();
