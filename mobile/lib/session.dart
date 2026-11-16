import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
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
    ready = true;
    notifyListeners();
    if (signedIn) {
      // Load floors in the background, then set up alerts (they need to know
      // whether the server can send them).
      refreshMe().catchError((_) {}).whenComplete(() => onSignedIn?.call(this));
    }
  }

  Future<void> signIn(String email, String password) async {
    final (token, signedInUser) = await api.login(email, password);
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
    final me = await api.me();
    user = me.user;
    floors = me.floors;
    alertsAvailable = me.alertsAvailable;
    today = me.today;
    if (floorId == null || !floors.any((f) => f.id == floorId)) floorId = floors.firstOrNull?.id;
    notifyListeners();
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
