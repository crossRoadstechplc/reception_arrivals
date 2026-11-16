import 'package:flutter/material.dart';

import '../dates.dart';
import '../guest_loader.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'guest_form_screen.dart';
import 'guest_sheet.dart';

enum CalendarView { week, day }

/// Day and week calendar. Arrived guests stay on it, struck through.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  CalendarView _view = CalendarView.week;

  /// The day in focus: the selected day in week view, the shown day in day view.
  late String _day;
  late final GuestLoader _loader;

  @override
  void initState() {
    super.initState();
    _day = session.today ?? isoFromDate(DateTime.now());
    final (from, to) = _range();
    _loader = GuestLoader(from: from, to: to);
    var trusted = session.today != null;
    _loader.addListener(() {
      final serverToday = _loader.data?.today;
      if (trusted || serverToday == null) return;
      trusted = true;
      if (serverToday != _day) _focus(serverToday);
    });
  }

  @override
  void dispose() {
    _loader.dispose();
    super.dispose();
  }

  (String, String) _range() {
    if (_view == CalendarView.day) return (_day, _day);
    final monday = mondayOf(_day);
    return (monday, addDays(monday, 6));
  }

  void _focus(String day, {CalendarView? view}) {
    setState(() {
      _day = day;
      if (view != null) _view = view;
    });
    final (from, to) = _range();
    _loader.setRange(from, to);
  }

  void _step(int direction) => _focus(addDays(_day, direction * (_view == CalendarView.day ? 1 : 7)));

  /// Monday to Friday, plus Saturday/Sunday when something is on (or selected).
  List<String> _weekDays() {
    final monday = mondayOf(_day);
    return [
      for (var i = 0; i < 7; i++)
        if (i < 5 || addDays(monday, i) == _day || _loader.on(addDays(monday, i)).isNotEmpty) addDays(monday, i),
    ];
  }

  Future<void> _add() async {
    final today = _loader.today;
    final saved = await openGuestForm(
      context,
      date: _day.compareTo(today) < 0 ? today : _day,
      hosts: _loader.data?.hosts ?? [],
    );
    if (saved) _loader.load(quiet: true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton(onPressed: _add, tooltip: 'Add guest', child: const Icon(Icons.add)),
      body: ListenableBuilder(
        listenable: _loader,
        builder: (context, _) {
          final today = _loader.today;
          final isAdmin = session.floor?.isAdmin ?? false;
          final (from, to) = _range();
          final days = _weekDays();

          final guests = _loader.on(_day);
          return RefreshIndicator(
            onRefresh: () => _loader.load(quiet: true),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
              children: [
                Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 12, 4, 4),
                        child: Row(
                          children: [
                            SegmentedButton<CalendarView>(
                              showSelectedIcon: false,
                              style: SegmentedButton.styleFrom(
                                selectedBackgroundColor: AppColors.ink,
                                selectedForegroundColor: Colors.white,
                                visualDensity: VisualDensity.compact,
                              ),
                              segments: const [
                                ButtonSegment(value: CalendarView.day, label: Text('Day')),
                                ButtonSegment(value: CalendarView.week, label: Text('Week')),
                              ],
                              selected: {_view},
                              onSelectionChanged: (s) => _focus(_day, view: s.first),
                            ),
                            const Spacer(),
                            IconButton(
                              tooltip: _view == CalendarView.day ? 'Previous day' : 'Previous week',
                              onPressed: () => _step(-1),
                              icon: const Icon(Icons.chevron_left),
                            ),
                            IconButton(
                              tooltip: _view == CalendarView.day ? 'Next day' : 'Next week',
                              onPressed: () => _step(1),
                              icon: const Icon(Icons.chevron_right),
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 4, 8, 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                _view == CalendarView.day ? friendlyDate(_day, today) : rangeLabel(from, days.last),
                                style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600, letterSpacing: -0.3),
                              ),
                            ),
                            if (_day != today) TextButton(onPressed: () => _focus(today), child: const Text('Today')),
                            TextButton.icon(
                              onPressed: () => _showKey(context),
                              icon: const Icon(Icons.info_outline, size: 18),
                              label: const Text('Key'),
                              style: TextButton.styleFrom(foregroundColor: AppColors.muted),
                            ),
                          ],
                        ),
                      ),
                      if (_view == CalendarView.week) ...[
                        const RowDivider(indent: 0),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
                          child: Row(
                            children: [
                              for (final d in days)
                                Expanded(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 3),
                                    child: _DayChip(
                                      iso: d,
                                      selected: d == _day,
                                      isToday: d == today,
                                      count: _loader.on(d).length,
                                      onTap: () => _focus(d),
                                      onLongPress: () => _focus(d, view: CalendarView.day),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (_loader.error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: ErrorBanner(message: _loader.error!, onRetry: _loader.load),
                  ),
                if (_loader.data == null && _loader.loading)
                  const Padding(
                    padding: EdgeInsets.only(top: 64),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else ...[
                  SectionHeader(_view == CalendarView.week ? longDate(_day) : 'Timeline', count: guests.length),
                  if (guests.isEmpty)
                    const Panel(
                      child: EmptyMessage(icon: Icons.event_available_outlined, title: 'No guests this day'),
                    )
                  else if (_view == CalendarView.week)
                    _Agenda(guests: guests, isToday: _day == today, loader: _loader, showHost: isAdmin)
                  else
                    _TimeGrid(guests: guests, isToday: _day == today, loader: _loader, showHost: isAdmin),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  void _showKey(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: AppColors.panel,
      builder: (context) => const SafeArea(child: _KeySheet()),
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({
    required this.iso,
    required this.selected,
    required this.isToday,
    required this.count,
    required this.onTap,
    required this.onLongPress,
  });
  final String iso;
  final bool selected, isToday;
  final int count;
  final VoidCallback onTap, onLongPress;

  @override
  Widget build(BuildContext context) {
    final fg = selected ? Colors.white : AppColors.ink;
    return Material(
      color: selected ? AppColors.ink : (isToday ? AppColors.signalSoft : AppColors.panel),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: selected ? AppColors.ink : (isToday ? const Color(0xFFF0C3AE) : AppColors.line)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        onLongPress: onLongPress,
        child: SizedBox(
          height: 66,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                shortWeekday(iso).toUpperCase(),
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: fg.withValues(alpha: 0.75),
                ),
              ),
              Text(
                '${dayOfMonth(iso)}',
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w600, color: fg),
              ),
              Text(count == 0 ? '—' : '$count', style: TextStyle(fontSize: 11, color: fg.withValues(alpha: 0.75))),
            ],
          ),
        ),
      ),
    );
  }
}

class _KeySheet extends StatelessWidget {
  const _KeySheet();

  @override
  Widget build(BuildContext context) {
    Widget item(GuestKind kind, String label, String body) => ListTile(
      leading: Padding(padding: const EdgeInsets.only(top: 4), child: KindDot(kind)),
      minLeadingWidth: 12,
      title: Text(label, style: struckStyle(const TextStyle(fontWeight: FontWeight.w600), KindStyle.struck(kind))),
      subtitle: Text(body),
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text('Key', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          ),
          item(GuestKind.expected, 'Expected', 'Not here yet.'),
          item(GuestKind.late, 'Late', 'Past their expected time and not checked in.'),
          item(GuestKind.arrived, 'Arrived', 'Reception checked them in. They stay on the calendar, struck through.'),
          item(GuestKind.gone, 'Not coming', 'Cancelled, or marked as a no-show.'),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text(
              'Tip: press and hold a day to open it in Day view.',
              style: TextStyle(color: AppColors.muted, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

/// Week view on a phone: the selected day's guests in time order, with a "now" line.
class _Agenda extends StatelessWidget {
  const _Agenda({required this.guests, required this.isToday, required this.loader, required this.showHost});
  final List<Guest> guests;
  final bool isToday;
  final GuestLoader loader;
  final bool showHost;

  @override
  Widget build(BuildContext context) {
    final now = loader.nowMinutes;
    final anyTime = guests.where((g) => g.expectedMinutes == null).toList();
    final timed = guests.where((g) => g.expectedMinutes != null).toList()
      ..sort((a, b) => a.expectedMinutes!.compareTo(b.expectedMinutes!));
    final items = <Object>[...anyTime];
    var placedNow = !isToday;
    for (final g in timed) {
      if (!placedNow && g.expectedMinutes! > now) {
        items.add('now');
        placedNow = true;
      }
      items.add(g);
    }
    if (!placedNow && timed.isNotEmpty) items.add('now');

    return Panel(
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0 && items[i] is Guest && items[i - 1] is Guest) const RowDivider(indent: 40),
            if (items[i] is Guest)
              _AgendaRow(
                guest: items[i] as Guest,
                kind: (items[i] as Guest).kind(today: loader.today, nowMinutes: now),
                showHost: showHost,
                onTap: () => showGuestSheet(context, guest: items[i] as Guest, loader: loader),
              )
            else
              _NowLine(minutes: now),
          ],
        ],
      ),
    );
  }
}

class _NowLine extends StatelessWidget {
  const _NowLine({required this.minutes});
  final int minutes;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
    child: Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(color: AppColors.signal, borderRadius: BorderRadius.circular(999)),
          child: Text(
            'Now · ${clockLabel(minutes)}',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
          ),
        ),
        Expanded(child: Container(height: 2, color: AppColors.signal)),
      ],
    ),
  );
}

class _AgendaRow extends StatelessWidget {
  const _AgendaRow({required this.guest, required this.kind, required this.showHost, required this.onTap});
  final Guest guest;
  final GuestKind kind;
  final bool showHost;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final struck = KindStyle.struck(kind);
    final faded = kind == GuestKind.gone;
    final sub = [if (guest.company?.isNotEmpty ?? false) guest.company!, if (showHost) guest.hostName].join(' · ');
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
        child: Row(
          children: [
            KindDot(kind),
            const SizedBox(width: 15),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    guest.expectedLabel ?? 'Any time',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: kind == GuestKind.late ? AppColors.signalDeep : AppColors.muted,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    guest.guestName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: struckStyle(
                      TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w600,
                        color: faded ? AppColors.muted : AppColors.ink,
                      ),
                      struck,
                    ),
                  ),
                  if (sub.isNotEmpty)
                    Text(
                      sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: struckStyle(const TextStyle(fontSize: 12.5, color: AppColors.muted), struck),
                    ),
                ],
              ),
            ),
            if (guest.hasCar)
              const Padding(
                padding: EdgeInsets.only(left: 8),
                child: Icon(Icons.directions_car_outlined, size: 18, color: AppColors.muted),
              ),
            const SizedBox(width: 10),
            _KindTag(guest: guest, kind: kind),
          ],
        ),
      ),
    );
  }
}

class _KindTag extends StatelessWidget {
  const _KindTag({required this.guest, required this.kind});
  final Guest guest;
  final GuestKind kind;

  @override
  Widget build(BuildContext context) => switch (kind) {
    GuestKind.arrived => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.check, size: 15, color: AppColors.cleared),
        const SizedBox(width: 2),
        Text(
          guest.checkedInLabel ?? '',
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.cleared),
        ),
      ],
    ),
    GuestKind.gone => Text(
      guest.status == 'NO_SHOW' ? 'No-show' : 'Cancelled',
      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.idle),
    ),
    GuestKind.late => const Text(
      'LATE',
      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.signalDeep),
    ),
    GuestKind.expected => const SizedBox.shrink(),
  };
}

/// Day view: guests placed on an hour grid at their expected time.
class _TimeGrid extends StatelessWidget {
  const _TimeGrid({required this.guests, required this.isToday, required this.loader, required this.showHost});
  final List<Guest> guests;
  final bool isToday;
  final GuestLoader loader;
  final bool showHost;

  static const hourHeight = 72.0;
  static const blockHeight = 60.0;

  @override
  Widget build(BuildContext context) {
    final now = loader.nowMinutes;
    final anyTime = guests.where((g) => g.expectedMinutes == null).toList();
    final timed = guests.where((g) => g.expectedMinutes != null).toList()
      ..sort((a, b) => a.expectedMinutes!.compareTo(b.expectedMinutes!));

    var startHour = 8;
    var endHour = 18;
    for (final g in timed) {
      final m = g.expectedMinutes!;
      if (m ~/ 60 < startHour) startHour = m ~/ 60;
      final end = ((m + blockHeight / hourHeight * 60) / 60).ceil();
      if (end > endHour) endHour = end.clamp(0, 24);
    }
    final height = (endHour - startHour) * hourHeight;
    double top(int minutes) => (minutes - startHour * 60) / 60 * hourHeight;

    // Side-by-side lanes for blocks that would overlap.
    final blockMinutes = blockHeight / hourHeight * 60;
    final lanes = <String, (int lane, int count)>{};
    var cluster = <(Guest, int)>[];
    var laneEnds = <double>[];
    var clusterEnd = -1.0;
    void close() {
      for (final (g, lane) in cluster) {
        lanes[g.id] = (lane, laneEnds.length);
      }
      cluster = [];
      laneEnds = [];
    }

    for (final g in timed) {
      final start = g.expectedMinutes!.toDouble();
      if (start >= clusterEnd) close();
      var lane = laneEnds.indexWhere((end) => end <= start);
      if (lane == -1) {
        laneEnds.add(0);
        lane = laneEnds.length - 1;
      }
      laneEnds[lane] = start + blockMinutes;
      cluster.add((g, lane));
      if (start + blockMinutes > clusterEnd) clusterEnd = start + blockMinutes;
    }
    close();

    return Panel(
      padding: const EdgeInsets.fromLTRB(0, 14, 12, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (anyTime.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 4, 12),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  const Text(
                    'ANY TIME',
                    style: TextStyle(fontFamily: 'monospace', fontSize: 10.5, color: AppColors.muted),
                  ),
                  for (final g in anyTime) _AnyTimeChip(guest: g, loader: loader),
                ],
              ),
            ),
          SizedBox(
            height: height + 16,
            child: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 58,
                    height: height,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        for (var h = startHour; h <= endHour; h++)
                          Positioned(
                            top: (h - startHour) * hourHeight - 8,
                            right: 8,
                            child: Text(
                              '${h % 12 == 0 ? 12 : h % 12} ${h < 12 || h == 24 ? 'AM' : 'PM'}',
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.muted),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, box) => SizedBox(
                        height: height,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            for (var h = 0; h <= endHour - startHour; h++)
                              Positioned(
                                top: h * hourHeight,
                                left: 0,
                                right: 0,
                                child: Container(height: 1, color: AppColors.line),
                              ),
                            Positioned(top: 0, bottom: 0, left: 0, child: Container(width: 1, color: AppColors.line)),
                            for (final g in timed)
                              Builder(
                                builder: (context) {
                                  final (lane, count) = lanes[g.id] ?? (0, 1);
                                  final width = (box.maxWidth - 8) / count;
                                  return Positioned(
                                    top: top(g.expectedMinutes!) + 2,
                                    left: 6 + lane * width,
                                    width: width - 4,
                                    height: blockHeight - 4,
                                    child: _Block(
                                      guest: g,
                                      kind: g.kind(today: loader.today, nowMinutes: now),
                                      showHost: showHost,
                                      compact: count > 1,
                                      onTap: () => showGuestSheet(context, guest: g, loader: loader),
                                    ),
                                  );
                                },
                              ),
                            if (isToday && now >= startHour * 60 && now <= endHour * 60)
                              Positioned(
                                top: top(now) - 1,
                                left: -4,
                                right: 0,
                                child: IgnorePointer(
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 9,
                                        height: 9,
                                        decoration: const BoxDecoration(
                                          color: AppColors.signal,
                                          shape: BoxShape.circle,
                                        ),
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
                  ),
                ],
              ),
            ),
          ),
        ],
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
    final style = KindStyle.of(kind);
    final struck = KindStyle.struck(kind);
    final sub = [if (guest.company?.isNotEmpty ?? false) guest.company!, if (showHost) guest.hostName].join(' · ');
    return Material(
      color: style.background,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: style.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      guest.expectedLabel ?? '',
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.muted),
                    ),
                  ),
                  const SizedBox(width: 6),
                  if (!compact || kind != GuestKind.expected)
                    Flexible(
                      child: _KindTag(guest: guest, kind: kind),
                    ),
                  if (guest.hasCar && !compact) ...[
                    const Spacer(),
                    const Icon(Icons.directions_car_outlined, size: 15, color: AppColors.muted),
                  ],
                ],
              ),
              Text(
                guest.guestName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: struckStyle(TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: style.text), struck),
              ),
              if (sub.isNotEmpty && !compact)
                Text(
                  sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: struckStyle(const TextStyle(fontSize: 11.5, color: AppColors.muted), struck),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AnyTimeChip extends StatelessWidget {
  const _AnyTimeChip({required this.guest, required this.loader});
  final Guest guest;
  final GuestLoader loader;

  @override
  Widget build(BuildContext context) {
    final kind = guest.kind(today: loader.today, nowMinutes: loader.nowMinutes);
    final style = KindStyle.of(kind);
    return Material(
      color: style.background,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: style.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => showGuestSheet(context, guest: guest, loader: loader),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (kind == GuestKind.arrived) ...[
                const Icon(Icons.check, size: 14, color: AppColors.cleared),
                const SizedBox(width: 4),
              ],
              Text(
                guest.guestName,
                style: struckStyle(
                  TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: style.text),
                  KindStyle.struck(kind),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
