import 'dart:async';

import 'package:flutter/foundation.dart';

import 'dates.dart';
import 'main.dart';
import 'models.dart';
import 'session.dart';

/// Loads one floor's guests for a date range and keeps them fresh: every 30
/// seconds, when an alert arrives, and when the app comes back to the front.
class GuestLoader extends ChangeNotifier {
  GuestLoader({required String from, required String to}) {
    _from = from;
    _to = to;
    refreshSignal.addListener(_onSignal);
    session.addListener(_onSession);
    _floorId = session.floor?.id;
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => load(quiet: true));
    load();
  }

  late String _from;
  late String _to;
  String? _floorId;
  Timer? _timer;
  int _request = 0;

  GuestRange? data;
  OfficeClock? clock;
  bool loading = false;
  String? error;

  String get from => _from;
  String get to => _to;
  String get today => data?.today ?? session.today ?? _from;
  int get nowMinutes => clock?.minutes ?? 0;

  List<Guest> on(String iso) => (data?.guests ?? const []).where((g) => g.visitDate == iso).toList();

  void setRange(String from, String to) {
    if (from == _from && to == _to) return;
    _from = from;
    _to = to;
    data = null;
    load();
  }

  void _onSignal() => load(quiet: true);

  void _onSession() {
    final id = session.floor?.id;
    if (id != _floorId) {
      _floorId = id;
      data = null;
      load();
    }
  }

  Future<void> load({bool quiet = false}) async {
    final floorId = _floorId ?? session.floor?.id;
    if (floorId == null || !session.signedIn) return;
    final ticket = ++_request;
    if (!quiet) {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      final result = await session.api.guests(floorId: floorId, from: _from, to: _to);
      if (ticket != _request) return; // a newer request is on its way
      data = result;
      clock = OfficeClock(result.officeMinutes);
      session.today = result.today;
      error = null;
    } catch (e) {
      if (ticket != _request) return;
      // Keep showing what we had during a quiet refresh; only complain on a real load.
      if (!quiet || data == null) error = e.toString();
    } finally {
      if (ticket == _request) {
        loading = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    refreshSignal.removeListener(_onSignal);
    session.removeListener(_onSession);
    super.dispose();
  }
}
