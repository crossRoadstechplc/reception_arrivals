import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../dates.dart';
import '../guest_loader.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'guest_form_screen.dart';
import 'guest_sheet.dart';

/// Calendar tab, laid out like a phone calendar app: Schedule, Day, 3 days,
/// Week and Month views, a month picker under the title, a menu for views,
/// filters and floors, and swiping left/right to move through time.
enum CalView { schedule, day, threeDay, week, month }

extension on CalView {
  String get label => switch (this) {
    CalView.schedule => 'Schedule',
    CalView.day => 'Day',
    CalView.threeDay => '3 days',
    CalView.week => 'Week',
    CalView.month => 'Month',
  };
  IconData get icon => switch (this) {
    CalView.schedule => Icons.view_agenda_outlined,
    CalView.day => Icons.view_day_outlined,
    CalView.threeDay => Icons.view_column_outlined,
    CalView.week => Icons.view_week_outlined,
    CalView.month => Icons.calendar_view_month_outlined,
  };
}

/// Colours for guests on the calendar: solid for what's still to come,
/// faded and struck through once they've arrived or aren't coming.
class _Look {
  const _Look(this.bg, this.fg, this.struck);
  final Color bg;
  final Color fg;
  final bool struck;

  static _Look of(GuestKind kind) => switch (kind) {
    GuestKind.expected => const _Look(AppColors.expected, Colors.white, false),
    GuestKind.late => const _Look(AppColors.signalDeep, Colors.white, false),
    GuestKind.arrived => const _Look(AppColors.clearedSoft, AppColors.clearedInk, true),
    GuestKind.gone || GuestKind.missed => const _Look(AppColors.idleSoft, AppColors.idle, true),
  };

  TextStyle text(double size, {FontWeight weight = FontWeight.w500}) => TextStyle(
    fontSize: size,
    fontWeight: weight,
    color: fg,
    decoration: struck ? TextDecoration.lineThrough : null,
    decorationColor: fg,
    decorationThickness: 1.5,
  );
}

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key, this.onOpenSettings});

  /// Tapping your initials opens the Settings tab.
  final VoidCallback? onOpenSettings;

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  static const _viewKey = 'calendar-view';
  static const _arrivedKey = 'calendar-show-arrived';
  static const _goneKey = 'calendar-show-gone';
  static const _mineKey = 'calendar-only-mine';

  final _scaffold = GlobalKey<ScaffoldState>();
  CalView _view = CalView.schedule;
  late String _anchor;
  late final GuestLoader _loader;
  late final TodayKeeper _keeper;
  bool _pickerOpen = false;
  late String _pickerMonth;
  bool _showArrived = true;
  bool _showGone = true;
  bool _onlyMine = false;

  @override
  void initState() {
    super.initState();
    _anchor = session.today ?? isoFromDate(DateTime.now());
    _pickerMonth = _anchor;
    final (from, to) = _range();
    _loader = GuestLoader(from: from, to: to);
    _keeper = TodayKeeper(loader: _loader, current: () => _anchor, goToday: _go);
    _loader.addListener(_keeper.check);
    _restorePrefs();
  }

  Future<void> _restorePrefs() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    final saved = CalView.values.where((v) => v.name == prefs.getString(_viewKey)).firstOrNull;
    setState(() {
      _showArrived = prefs.getBool(_arrivedKey) ?? true;
      _showGone = prefs.getBool(_goneKey) ?? true;
      _onlyMine = prefs.getBool(_mineKey) ?? false;
    });
    if (saved != null && saved != _view) _go(_anchor, view: saved);
  }

  @override
  void dispose() {
    _keeper.dispose();
    _loader.dispose();
    super.dispose();
  }

  String get _today => _loader.today;

  /// What each view loads.
  (String, String) _range([CalView? view, String? anchor]) {
    final a = anchor ?? _anchor;
    return switch (view ?? _view) {
      CalView.schedule => (a, addDays(a, 20)),
      CalView.day => (a, a),
      CalView.threeDay => (a, addDays(a, 2)),
      CalView.week => (mondayOf(a), addDays(mondayOf(a), 6)),
      CalView.month => (monthGrid(a).first, monthGrid(a).last),
    };
  }

  void _go(String anchor, {CalView? view}) {
    _keeper.moved();
    setState(() {
      _anchor = anchor;
      _pickerMonth = anchor;
      if (view != null) _view = view;
    });
    final (from, to) = _range();
    _loader.setRange(from, to);
    if (view != null) SharedPreferences.getInstance().then((p) => p.setString(_viewKey, view.name));
  }

  /// Swipe or arrow: move one period back or forward.
  void _step(int direction) {
    final next = switch (_view) {
      CalView.schedule => addDays(_anchor, 21 * direction),
      CalView.day => addDays(_anchor, direction),
      CalView.threeDay => addDays(_anchor, 3 * direction),
      CalView.week => addDays(_anchor, 7 * direction),
      CalView.month => addMonths(_anchor, direction),
    };
    _go(next);
  }

  void _togglePicker() => setState(() {
    _pickerOpen = !_pickerOpen;
    _pickerMonth = _anchor;
  });

  void _showPickerMonth(String month) => setState(() => _pickerMonth = month);

  void _pickDate(String iso) {
    setState(() => _pickerOpen = false);
    _go(iso, view: _view == CalView.month ? CalView.day : null);
  }

  Future<void> _setFilter(String key, bool value, void Function(bool) apply) async {
    setState(() => apply(value));
    (await SharedPreferences.getInstance()).setBool(key, value);
  }

  /// Guests on a day after the Show filters.
  List<Guest> _on(String iso) => _loader.on(iso).where((g) {
    if (!_showArrived && g.checkedIn) return false;
    if (!_showGone && (g.notComing || _kind(g) == GuestKind.missed)) return false;
    if (_onlyMine && !g.mine) return false;
    return true;
  }).toList()..sort((a, b) => (a.expectedMinutes ?? -1).compareTo(b.expectedMinutes ?? -1));

  GuestKind _kind(Guest g) => g.kind(today: _today, nowMinutes: _loader.nowMinutes);

  void _open(Guest g) => showGuestSheet(context, guest: g, loader: _loader, onShowDate: _showDate);

  /// Moves to a saved guest's date when it isn't on screen.
  void _showDate(String date) {
    final (from, to) = _range();
    if (date.compareTo(from) < 0 || date.compareTo(to) > 0) _go(date);
  }

  Future<void> _add([String? date]) async {
    final day = date ?? _anchor;
    final saved = await openGuestForm(context, date: day.compareTo(_today) < 0 ? _today : day, data: _loader.data);
    if (saved != null && mounted) _showDate(saved);
  }

  String get _title {
    if (_view == CalView.week || _view == CalView.threeDay) {
      final (from, to) = _range();
      if (!sameMonth(from, to)) return '${monthName(from).substring(0, 3)} – ${monthName(to).substring(0, 3)}';
    }
    final title = monthName(_anchor);
    return _anchor.substring(0, 4) == _today.substring(0, 4) ? title : monthYear(_anchor);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _loader,
      builder: (context, _) {
        final isAdmin = session.floor?.isAdmin ?? false;
        Widget body;
        if (_loader.data == null && _loader.loading) {
          body = const Center(child: CircularProgressIndicator());
        } else {
          body = switch (_view) {
            CalView.schedule => _ScheduleView(state: this),
            CalView.day => _GridView(state: this, days: [_anchor], detailed: true, showHost: isAdmin),
            CalView.threeDay => _GridView(
              state: this,
              days: [for (var i = 0; i < 3; i++) addDays(_anchor, i)],
              showHost: isAdmin,
            ),
            CalView.week => _GridView(
              state: this,
              days: [for (var i = 0; i < 7; i++) addDays(mondayOf(_anchor), i)],
              showHost: isAdmin,
            ),
            CalView.month => _MonthView(state: this),
          };
        }

        return Scaffold(
          key: _scaffold,
          backgroundColor: AppColors.panel,
          drawer: _CalendarDrawer(state: this),
          floatingActionButton: FloatingActionButton(
            onPressed: _add,
            tooltip: 'Add guest',
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: const Icon(Icons.add, size: 28),
          ),
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                _TopBar(state: this),
                AnimatedSize(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topCenter,
                  child: _pickerOpen ? _MiniMonth(state: this) : const SizedBox(width: double.infinity),
                ),
                if (_loader.error != null) ErrorBanner(message: _loader.error!, onRetry: _loader.load),
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onHorizontalDragEnd: (details) {
                      final v = details.primaryVelocity ?? 0;
                      if (v.abs() > 300) _step(v < 0 ? 1 : -1);
                    },
                    child: RefreshIndicator(onRefresh: () => _loader.load(quiet: true), child: body),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

class _TopBar extends StatelessWidget {
  const _TopBar({required this.state});
  final _CalendarScreenState state;

  @override
  Widget build(BuildContext context) {
    final user = session.user;
    final initials = (user?.displayName ?? '?')
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => p[0].toUpperCase())
        .join();
    return SizedBox(
      height: 60,
      child: Row(
        children: [
          const SizedBox(width: 4),
          IconButton(
            tooltip: 'Views, filters and floors',
            icon: const Icon(Icons.menu),
            onPressed: () => state._scaffold.currentState?.openDrawer(),
          ),
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: state._togglePicker,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          state._title,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w400),
                        ),
                      ),
                      AnimatedRotation(
                        turns: state._pickerOpen ? 0.5 : 0,
                        duration: const Duration(milliseconds: 200),
                        child: const Icon(Icons.arrow_drop_down, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Search guests',
            icon: const Icon(Icons.search),
            onPressed: () => showSearch(context: context, delegate: _GuestSearch(state)),
          ),
          IconButton(
            tooltip: 'Today',
            onPressed: () => state._go(state._today),
            icon: SizedBox(
              width: 26,
              height: 26,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  const Icon(Icons.calendar_today_outlined, size: 24),
                  Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Text(
                      '${dayOfMonth(state._today)}',
                      style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 10, left: 2),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: state.widget.onOpenSettings,
              child: CircleAvatar(
                radius: 16,
                backgroundColor: AppColors.signal,
                foregroundColor: Colors.white,
                child: Text(initials, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Mini month (tap the title)                                          */
/* ------------------------------------------------------------------ */

class _MiniMonth extends StatelessWidget {
  const _MiniMonth({required this.state});
  final _CalendarScreenState state;

  @override
  Widget build(BuildContext context) {
    final month = state._pickerMonth;
    final days = monthGrid(month);
    final today = state._today;
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.panel,
        border: Border(bottom: BorderSide(color: AppColors.line)),
        boxShadow: [BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, 4))],
      ),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: GestureDetector(
        onHorizontalDragEnd: (d) {
          final v = d.primaryVelocity ?? 0;
          if (v.abs() > 200) state._showPickerMonth(addMonths(month, v < 0 ? 1 : -1));
        },
        child: Column(
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous month',
                  icon: const Icon(Icons.chevron_left),
                  onPressed: () => state._showPickerMonth(addMonths(month, -1)),
                ),
                Expanded(
                  child: Text(
                    monthYear(month),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                  ),
                ),
                IconButton(
                  tooltip: 'Next month',
                  icon: const Icon(Icons.chevron_right),
                  onPressed: () => state._showPickerMonth(addMonths(month, 1)),
                ),
              ],
            ),
            const _WeekdayRow(),
            for (var r = 0; r < 6; r++)
              Row(
                children: [
                  for (final d in days.sublist(r * 7, r * 7 + 7))
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(999),
                        onTap: () => state._pickDate(d),
                        child: SizedBox(
                          height: 40,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 28,
                                height: 28,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: d == state._anchor ? AppColors.signal : null,
                                  border: d == today && d != state._anchor ? Border.all(color: AppColors.signal) : null,
                                ),
                                child: Text(
                                  '${dayOfMonth(d)}',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: d == state._anchor || d == today ? FontWeight.w600 : FontWeight.w400,
                                    color: d == state._anchor
                                        ? Colors.white
                                        : (sameMonth(d, month) ? AppColors.ink : AppColors.lineStrong),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Container(
                                width: 4,
                                height: 4,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: state._loader.on(d).isNotEmpty && sameMonth(d, month)
                                      ? AppColors.signal
                                      : Colors.transparent,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _WeekdayRow extends StatelessWidget {
  const _WeekdayRow();

  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (final d in const ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(
              d,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.muted),
            ),
          ),
        ),
    ],
  );
}

/* ------------------------------------------------------------------ */
/* Drawer: views, filters, floors                                      */
/* ------------------------------------------------------------------ */

class _CalendarDrawer extends StatelessWidget {
  const _CalendarDrawer({required this.state});
  final _CalendarScreenState state;

  @override
  Widget build(BuildContext context) {
    final isAdmin = session.floor?.isAdmin ?? false;
    void close() => Navigator.of(context).pop();

    Widget check(String label, bool value, Color color, ValueChanged<bool> onChanged) => CheckboxListTile(
      value: value,
      onChanged: (v) => onChanged(v ?? false),
      controlAffinity: ListTileControlAffinity.leading,
      activeColor: color,
      dense: true,
      title: Text(label, style: const TextStyle(fontSize: 14.5)),
    );

    return Drawer(
      backgroundColor: AppColors.panel,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.horizontal(right: Radius.circular(18))),
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.asset('assets/icon/icon.png', width: 30, height: 30),
                  ),
                  const SizedBox(width: 10),
                  const Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(text: 'Arrival '),
                        TextSpan(
                          text: 'Desk',
                          style: TextStyle(color: AppColors.signal),
                        ),
                      ],
                    ),
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
            for (final v in CalView.values)
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: ListTile(
                  leading: Icon(v.icon, color: v == state._view ? AppColors.signalDeep : AppColors.inkSoft),
                  title: Text(
                    v.label,
                    style: TextStyle(
                      fontWeight: FontWeight.w500,
                      color: v == state._view ? AppColors.signalDeep : AppColors.ink,
                    ),
                  ),
                  selected: v == state._view,
                  selectedTileColor: AppColors.signalSoft,
                  shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.horizontal(right: Radius.circular(999)),
                  ),
                  onTap: () {
                    close();
                    state._go(state._anchor, view: v);
                  },
                ),
              ),
            const Divider(height: 24),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 4),
              child: Text(
                'SHOW',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
              ),
            ),
            check(
              'Arrived guests',
              state._showArrived,
              AppColors.cleared,
              (v) => state._setFilter(_CalendarScreenState._arrivedKey, v, (x) => state._showArrived = x),
            ),
            check(
              'Cancelled, no-shows and missed',
              state._showGone,
              AppColors.idle,
              (v) => state._setFilter(_CalendarScreenState._goneKey, v, (x) => state._showGone = x),
            ),
            if (isAdmin)
              check(
                'Only my guests',
                state._onlyMine,
                AppColors.signal,
                (v) => state._setFilter(_CalendarScreenState._mineKey, v, (x) => state._onlyMine = x),
              ),
            if (session.floors.length > 1) ...[
              const Divider(height: 24),
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, 4),
                child: Text(
                  'FLOOR',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                ),
              ),
              for (final f in session.floors)
                ListTile(
                  leading: Icon(
                    Icons.apartment_outlined,
                    color: f.id == session.floor?.id ? AppColors.signalDeep : AppColors.muted,
                  ),
                  title: Text(f.name),
                  trailing: f.id == session.floor?.id ? const Icon(Icons.check, color: AppColors.signalDeep) : null,
                  onTap: () {
                    close();
                    session.selectFloor(f.id);
                  },
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Schedule                                                            */
/* ------------------------------------------------------------------ */

class _ScheduleView extends StatelessWidget {
  const _ScheduleView({required this.state});
  final _CalendarScreenState state;

  @override
  Widget build(BuildContext context) {
    final (from, to) = state._range();
    final today = state._today;
    final children = <Widget>[
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
        child: TextButton.icon(
          onPressed: () => state._step(-1),
          icon: const Icon(Icons.expand_less),
          label: const Text('Earlier'),
          style: TextButton.styleFrom(foregroundColor: AppColors.muted),
        ),
      ),
    ];
    String? lastMonth;
    var any = false;
    for (var d = from; d.compareTo(to) <= 0; d = addDays(d, 1)) {
      if (lastMonth == null || !sameMonth(d, lastMonth)) {
        children.add(_MonthBanner(iso: d));
        lastMonth = d;
      }
      if (weekdayOf(d) == 1 || d == from) {
        children.add(
          Padding(
            padding: const EdgeInsets.fromLTRB(76, 6, 16, 6),
            child: Text(
              rangeLabel(mondayOf(d), addDays(mondayOf(d), 6)),
              style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w500),
            ),
          ),
        );
      }
      final guests = state._on(d);
      if (guests.isEmpty && d != today) continue;
      any = any || guests.isNotEmpty;
      children.add(_ScheduleDay(state: state, iso: d, guests: guests));
    }
    if (!any) {
      children.add(
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: EmptyMessage(icon: Icons.event_available_outlined, title: 'No guests in these weeks'),
        ),
      );
    }
    children.add(
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 110),
        child: OutlinedButton.icon(
          onPressed: () => state._step(1),
          icon: const Icon(Icons.expand_more),
          label: const Text('Next 3 weeks'),
        ),
      ),
    );
    return ListView(physics: const AlwaysScrollableScrollPhysics(), children: children);
  }
}

class _MonthBanner extends StatelessWidget {
  const _MonthBanner({required this.iso});
  final String iso;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
    height: 64,
    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
    alignment: Alignment.bottomLeft,
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(14),
      gradient: const LinearGradient(colors: [AppColors.signalSoft, Color(0xFFF7EFE2)]),
    ),
    child: Text(monthYear(iso), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w500)),
  );
}

class _DateBadge extends StatelessWidget {
  const _DateBadge({required this.iso, required this.today, this.size = 38, this.onTap});
  final String iso;
  final String today;
  final double size;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isToday = iso == today;
    final past = iso.compareTo(today) < 0;
    return InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            weekdayCaps(iso),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.6,
              color: isToday ? AppColors.signalDeep : AppColors.muted,
            ),
          ),
          const SizedBox(height: 2),
          Container(
            width: size,
            height: size,
            alignment: Alignment.center,
            decoration: BoxDecoration(shape: BoxShape.circle, color: isToday ? AppColors.signal : null),
            child: Text(
              '${dayOfMonth(iso)}',
              style: TextStyle(
                fontSize: size * 0.52,
                color: isToday ? Colors.white : (past ? AppColors.muted : AppColors.ink),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScheduleDay extends StatelessWidget {
  const _ScheduleDay({required this.state, required this.iso, required this.guests});
  final _CalendarScreenState state;
  final String iso;
  final List<Guest> guests;

  @override
  Widget build(BuildContext context) {
    final today = state._today;
    final now = state._loader.nowMinutes;
    final items = <Widget>[];
    var nowPlaced = iso != today;
    for (final g in guests) {
      if (!nowPlaced && (g.expectedMinutes ?? -1) > now) {
        items.add(const _NowRule());
        nowPlaced = true;
      }
      items.add(_ScheduleChip(guest: g, kind: state._kind(g), onTap: () => state._open(g)));
    }
    if (!nowPlaced) items.add(const _NowRule());
    if (guests.isEmpty) {
      items.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text('No guests today', style: TextStyle(color: AppColors.muted.withValues(alpha: 0.9))),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 2, 12, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 56,
            child: _DateBadge(
              iso: iso,
              today: today,
              onTap: () => state._go(iso, view: CalView.day),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [for (final w in items) Padding(padding: const EdgeInsets.only(bottom: 6), child: w)],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NowRule extends StatelessWidget {
  const _NowRule();

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Transform.translate(
        offset: const Offset(-5, 0),
        child: Container(
          width: 10,
          height: 10,
          decoration: const BoxDecoration(color: AppColors.signal, shape: BoxShape.circle),
        ),
      ),
      Expanded(
        child: Transform.translate(
          offset: const Offset(-5, 0),
          child: Container(height: 2, color: AppColors.signal),
        ),
      ),
    ],
  );
}

class _ScheduleChip extends StatelessWidget {
  const _ScheduleChip({required this.guest, required this.kind, required this.onTap});
  final Guest guest;
  final GuestKind kind;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final look = _Look.of(kind);
    final parts = <String>[
      guest.expectedLabel ?? 'Any time',
      if (kind == GuestKind.arrived && guest.checkedInLabel != null) 'arrived ${guest.checkedInLabel}',
      if (kind == GuestKind.gone) guest.status == 'NO_SHOW' ? 'no-show' : 'cancelled',
      if (kind == GuestKind.missed) 'missed',
      if (kind == GuestKind.expected || kind == GuestKind.late) ...[
        if (guest.company?.isNotEmpty ?? false) guest.company!,
      ],
    ];
    return Material(
      color: look.bg,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 10, 8),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(guest.guestName, maxLines: 1, overflow: TextOverflow.ellipsis, style: look.text(14.5)),
                    const SizedBox(height: 1),
                    Row(
                      children: [
                        if (kind == GuestKind.arrived)
                          const Padding(
                            padding: EdgeInsets.only(right: 3),
                            child: Icon(Icons.check, size: 14, color: AppColors.cleared),
                          ),
                        Flexible(
                          child: Text(
                            parts.join(' · ') + (kind == GuestKind.late ? ' · LATE' : ''),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12.5, color: look.fg.withValues(alpha: 0.92)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (guest.hasCar) Icon(Icons.directions_car_outlined, size: 17, color: look.fg.withValues(alpha: 0.85)),
            ],
          ),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Day / 3 days / Week: hour grid                                      */
/* ------------------------------------------------------------------ */

const _hourHeight = 56.0;
const _blockMinutes = 45;

/// Side-by-side lanes for blocks that would overlap: id -> (lane, laneCount).
Map<String, (int, int)> _lanes(List<Guest> timed) {
  final result = <String, (int, int)>{};
  var cluster = <(Guest, int)>[];
  var laneEnds = <int>[];
  var clusterEnd = -1;
  void close() {
    for (final (g, lane) in cluster) {
      result[g.id] = (lane, laneEnds.length);
    }
    cluster = [];
    laneEnds = [];
  }

  for (final g in timed) {
    final start = g.expectedMinutes!;
    if (start >= clusterEnd) close();
    var lane = laneEnds.indexWhere((end) => end <= start);
    if (lane == -1) {
      laneEnds.add(0);
      lane = laneEnds.length - 1;
    }
    laneEnds[lane] = start + _blockMinutes;
    cluster.add((g, lane));
    if (start + _blockMinutes > clusterEnd) clusterEnd = start + _blockMinutes;
  }
  close();
  return result;
}

class _GridView extends StatefulWidget {
  const _GridView({required this.state, required this.days, this.detailed = false, this.showHost = false});
  final _CalendarScreenState state;
  final List<String> days;
  final bool detailed;
  final bool showHost;

  @override
  State<_GridView> createState() => _GridViewState();
}

class _GridViewState extends State<_GridView> {
  late final ScrollController _scroll;

  @override
  void initState() {
    super.initState();
    // Open around the working day (or just before "now").
    final now = widget.state._loader.nowMinutes;
    final hour = widget.days.contains(widget.state._today) ? (now ~/ 60 - 2).clamp(7, 16) : 7;
    _scroll = ScrollController(initialScrollOffset: hour * _hourHeight);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final today = state._today;
    final now = state._loader.nowMinutes;
    final days = widget.days;
    final labelWidth = days.length == 1 ? 52.0 : 40.0;
    final perDay = {for (final d in days) d: state._on(d)};
    final anyTime = {for (final d in days) d: perDay[d]!.where((g) => g.expectedMinutes == null).toList()};
    final hasAnyTime = anyTime.values.any((l) => l.isNotEmpty);

    return Column(
      children: [
        // Day headers (+ all-day row)
        Container(
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AppColors.line)),
          ),
          padding: const EdgeInsets.only(bottom: 6),
          child: Column(
            children: [
              Row(
                children: [
                  SizedBox(width: labelWidth),
                  for (final d in days)
                    Expanded(
                      child: Align(
                        alignment: days.length == 1 ? Alignment.centerLeft : Alignment.center,
                        child: Padding(
                          padding: EdgeInsets.only(left: days.length == 1 ? 4 : 0),
                          child: _DateBadge(
                            iso: d,
                            today: today,
                            size: days.length > 3 ? 30 : 38,
                            onTap: days.length == 1 ? null : () => state._go(d, view: CalView.day),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              if (hasAnyTime)
                Padding(
                  padding: const EdgeInsets.only(top: 6, right: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: labelWidth),
                      for (final d in days)
                        Expanded(
                          child: Column(
                            children: [
                              for (final g in anyTime[d]!)
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(2, 0, 2, 3),
                                  child: _AllDayChip(guest: g, kind: state._kind(g), onTap: () => state._open(g)),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(top: 10, bottom: 110),
            child: SizedBox(
              height: 24 * _hourHeight,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: labelWidth,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        for (var h = 1; h < 24; h++)
                          Positioned(
                            top: h * _hourHeight - 7,
                            right: 6,
                            child: Text(
                              '${h % 12 == 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}',
                              style: const TextStyle(fontSize: 10.5, color: AppColors.muted),
                            ),
                          ),
                      ],
                    ),
                  ),
                  for (final d in days)
                    Expanded(
                      child: _DayColumn(
                        state: state,
                        iso: d,
                        guests: perDay[d]!.where((g) => g.expectedMinutes != null).toList(),
                        isToday: d == today,
                        now: now,
                        detailed: widget.detailed,
                        showHost: widget.showHost,
                        compact: days.length > 1,
                      ),
                    ),
                  const SizedBox(width: 6),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DayColumn extends StatelessWidget {
  const _DayColumn({
    required this.state,
    required this.iso,
    required this.guests,
    required this.isToday,
    required this.now,
    required this.detailed,
    required this.showHost,
    required this.compact,
  });
  final _CalendarScreenState state;
  final String iso;
  final List<Guest> guests;
  final bool isToday;
  final int now;
  final bool detailed;
  final bool showHost;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final lanes = _lanes(guests);
    return LayoutBuilder(
      builder: (context, box) => GestureDetector(
        // Tap an empty slot to add a guest on that day.
        behavior: HitTestBehavior.translucent,
        onLongPress: () => state._add(iso),
        child: Container(
          decoration: const BoxDecoration(
            border: Border(left: BorderSide(color: AppColors.line)),
          ),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              for (var h = 0; h <= 24; h++)
                Positioned(
                  top: h * _hourHeight,
                  left: 0,
                  right: 0,
                  child: Container(height: 1, color: AppColors.line),
                ),
              for (final g in guests)
                Builder(
                  builder: (context) {
                    final (lane, count) = lanes[g.id] ?? (0, 1);
                    final width = (box.maxWidth - 2) / count;
                    return Positioned(
                      top: g.expectedMinutes! / 60 * _hourHeight + 1,
                      left: 1 + lane * width,
                      width: width - 2,
                      height: _blockMinutes / 60 * _hourHeight - 2,
                      child: _Block(
                        guest: g,
                        kind: state._kind(g),
                        showHost: showHost && detailed,
                        compact: compact || count > 2,
                        onTap: () => state._open(g),
                      ),
                    );
                  },
                ),
              if (isToday)
                Positioned(
                  top: now / 60 * _hourHeight - 1,
                  left: -5,
                  right: 0,
                  child: IgnorePointer(
                    child: Row(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: const BoxDecoration(color: AppColors.signal, shape: BoxShape.circle),
                        ),
                        Expanded(child: Container(height: 2, color: AppColors.signal)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({
    required this.guest,
    required this.kind,
    required this.showHost,
    required this.compact,
    required this.onTap,
  });
  final Guest guest;
  final GuestKind kind;
  final bool showHost;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final look = _Look.of(kind);
    final sub = compact
        ? (guest.expectedLabel ?? '')
        : [
            guest.expectedLabel ?? '',
            if (kind == GuestKind.late) 'late',
            if (kind == GuestKind.missed) 'missed',
            if (kind == GuestKind.arrived && guest.checkedInLabel != null) 'arrived ${guest.checkedInLabel}',
            if (guest.company?.isNotEmpty ?? false) guest.company!,
            if (showHost) 'Host: ${guest.mine ? 'you' : guest.hostName}',
          ].where((s) => s.isNotEmpty).join(' · ');
    return Material(
      color: look.bg,
      borderRadius: BorderRadius.circular(6),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: compact ? 4 : 8, vertical: 3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (kind == GuestKind.arrived && !compact)
                    const Padding(
                      padding: EdgeInsets.only(right: 3),
                      child: Icon(Icons.check, size: 13, color: AppColors.cleared),
                    ),
                  Expanded(
                    child: Text(
                      guest.guestName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: look.text(compact ? 11.5 : 13.5),
                    ),
                  ),
                  if (guest.hasCar && !compact) Icon(Icons.directions_car_outlined, size: 14, color: look.fg),
                ],
              ),
              Text(
                sub,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: compact ? 10 : 11.5, color: look.fg.withValues(alpha: 0.9)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AllDayChip extends StatelessWidget {
  const _AllDayChip({required this.guest, required this.kind, required this.onTap});
  final Guest guest;
  final GuestKind kind;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final look = _Look.of(kind);
    return Material(
      color: look.bg,
      borderRadius: BorderRadius.circular(5),
      child: InkWell(
        borderRadius: BorderRadius.circular(5),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Row(
            children: [
              Expanded(
                child: Text(guest.guestName, maxLines: 1, overflow: TextOverflow.ellipsis, style: look.text(12)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Month                                                               */
/* ------------------------------------------------------------------ */

class _MonthView extends StatelessWidget {
  const _MonthView({required this.state});
  final _CalendarScreenState state;

  @override
  Widget build(BuildContext context) {
    final days = monthGrid(state._anchor);
    final today = state._today;
    // Only the weeks this month needs (5 or 6, sometimes 4).
    final rows = [
      for (var r = 0; r < 6; r++)
        if (days.sublist(r * 7, r * 7 + 7).any((d) => sameMonth(d, state._anchor))) r,
    ];
    return LayoutBuilder(
      builder: (context, box) {
        // Leave room for the add button under the grid.
        final rowHeight = ((box.maxHeight - 30 - 84) / rows.length).clamp(64.0, 160.0);
        final maxChips = ((rowHeight - 28) / 17).floor().clamp(1, 6);
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 84),
          children: [
            const _WeekdayRow(),
            for (final r in rows)
              Container(
                height: rowHeight,
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: AppColors.line)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var c = 0; c < 7; c++)
                      Expanded(
                        child: _MonthCell(
                          state: state,
                          iso: days[r * 7 + c],
                          inMonth: sameMonth(days[r * 7 + c], state._anchor),
                          isToday: days[r * 7 + c] == today,
                          maxChips: maxChips,
                          first: c == 0,
                        ),
                      ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _MonthCell extends StatelessWidget {
  const _MonthCell({
    required this.state,
    required this.iso,
    required this.inMonth,
    required this.isToday,
    required this.maxChips,
    required this.first,
  });
  final _CalendarScreenState state;
  final String iso;
  final bool inMonth;
  final bool isToday;
  final int maxChips;
  final bool first;

  @override
  Widget build(BuildContext context) {
    final guests = state._on(iso);
    final shown = guests.length > maxChips ? maxChips - 1 : guests.length;
    return InkWell(
      onTap: () => state._go(iso, view: CalView.day),
      child: Container(
        decoration: BoxDecoration(
          border: first ? null : const Border(left: BorderSide(color: AppColors.line)),
        ),
        padding: const EdgeInsets.fromLTRB(2, 3, 2, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(shape: BoxShape.circle, color: isToday ? AppColors.signal : null),
                child: Text(
                  '${dayOfMonth(iso)}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isToday ? FontWeight.w600 : FontWeight.w400,
                    color: isToday ? Colors.white : (inMonth ? AppColors.ink : AppColors.lineStrong),
                  ),
                ),
              ),
            ),
            for (final g in guests.take(shown))
              Container(
                margin: const EdgeInsets.only(top: 2),
                padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
                decoration: BoxDecoration(color: _Look.of(state._kind(g)).bg, borderRadius: BorderRadius.circular(4)),
                child: Text(
                  g.guestName,
                  maxLines: 1,
                  overflow: TextOverflow.clip,
                  softWrap: false,
                  style: _Look.of(state._kind(g)).text(9.5),
                ),
              ),
            if (guests.length > shown)
              Padding(
                padding: const EdgeInsets.only(top: 2, left: 2),
                child: Text(
                  '+${guests.length - shown} more',
                  maxLines: 1,
                  style: const TextStyle(fontSize: 9.5, color: AppColors.muted),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

class _GuestSearch extends SearchDelegate<void> {
  _GuestSearch(this.state) : super(searchFieldLabel: 'Search guests, companies, plates');
  final _CalendarScreenState state;

  @override
  List<Widget> buildActions(BuildContext context) => [
    if (query.isNotEmpty) IconButton(tooltip: 'Clear', icon: const Icon(Icons.close), onPressed: () => query = ''),
  ];

  @override
  Widget buildLeading(BuildContext context) =>
      IconButton(tooltip: 'Back', icon: const Icon(Icons.arrow_back), onPressed: () => close(context, null));

  @override
  Widget buildResults(BuildContext context) => _results(context);

  @override
  Widget buildSuggestions(BuildContext context) => _results(context);

  Widget _results(BuildContext context) {
    final (from, to) = state._range();
    final needle = query.trim().toLowerCase();
    final squashed = needle.replaceAll(RegExp(r'[\s-]+'), '');
    final all = (state._loader.data?.guests ?? const <Guest>[]).toList()
      ..sort(
        (a, b) => a.visitDate.compareTo(b.visitDate) != 0
            ? a.visitDate.compareTo(b.visitDate)
            : (a.expectedMinutes ?? -1).compareTo(b.expectedMinutes ?? -1),
      );
    final matches = needle.isEmpty
        ? all
        : all.where((g) {
            final text = '${g.guestName} ${g.company ?? ''} ${g.hostName} ${g.vehicle ?? ''}'.toLowerCase();
            final plate = (g.licensePlate ?? '').toLowerCase().replaceAll(RegExp(r'[\s-]+'), '');
            return text.contains(needle) || (squashed.isNotEmpty && plate.contains(squashed));
          }).toList();
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(
            'Searching ${rangeLabel(from, to)}',
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
        ),
        if (matches.isEmpty)
          const EmptyMessage(icon: Icons.search_off, title: 'No guests match')
        else
          for (final g in matches)
            ListTile(
              leading: Container(
                width: 12,
                height: 12,
                margin: const EdgeInsets.only(top: 4),
                decoration: BoxDecoration(color: _Look.of(state._kind(g)).bg, shape: BoxShape.circle),
              ),
              minLeadingWidth: 12,
              title: Text(
                g.guestName,
                style: TextStyle(decoration: KindStyle.struck(state._kind(g)) ? TextDecoration.lineThrough : null),
              ),
              subtitle: Text(
                [
                  '${shortWeekday(g.visitDate)} ${dayOfMonth(g.visitDate)} ${monthName(g.visitDate).substring(0, 3)}',
                  g.expectedLabel ?? 'Any time',
                  if (g.company?.isNotEmpty ?? false) g.company!,
                  if (g.licensePlate?.isNotEmpty ?? false) g.licensePlate!,
                ].join(' · '),
              ),
              onTap: () {
                close(context, null);
                state._open(g);
              },
            ),
      ],
    );
  }
}
