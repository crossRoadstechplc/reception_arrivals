import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../brand.dart';
import '../dates.dart';
import '../guest_loader.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'guest_form_screen.dart';
import 'guest_sheet.dart';

/// One day's guests, grouped into "Still to come", "Checked in" and "Not coming".
class GuestsScreen extends StatefulWidget {
  const GuestsScreen({super.key});

  @override
  State<GuestsScreen> createState() => _GuestsScreenState();
}

class _GuestsScreenState extends State<GuestsScreen> {
  late String _date;
  late final GuestLoader _loader;
  late final TodayKeeper _keeper;

  @override
  void initState() {
    super.initState();
    _date = session.today ?? isoFromDate(DateTime.now());
    _loader = GuestLoader(from: _date, to: _date);
    _keeper = TodayKeeper(loader: _loader, current: () => _date, goToday: _go);
    _loader.addListener(_keeper.check);
  }

  @override
  void dispose() {
    _loader.dispose();
    super.dispose();
  }

  void _go(String date) {
    _keeper.moved();
    setState(() => _date = date);
    _loader.setRange(date, date);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: dateFromIso(_date),
      firstDate: DateTime(2024),
      lastDate: DateTime(2100),
    );
    if (picked != null) _go(isoFromDate(picked));
  }

  Future<void> _add() async {
    final today = _loader.today;
    final saved = await openGuestForm(context, date: _date.compareTo(today) < 0 ? today : _date, data: _loader.data);
    if (saved) _loader.load(quiet: true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.add),
        label: const Text('Add guest', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: ListenableBuilder(
        listenable: _loader,
        builder: (context, _) {
          final today = _loader.today;
          final now = _loader.nowMinutes;
          final guests = _loader.on(_date);
          final isAdmin = session.floor?.isAdmin ?? false;
          bool missed(Guest g) => g.kind(today: today, nowMinutes: now) == GuestKind.missed;
          final toCome = guests.where((g) => g.status == 'EXPECTED' && !missed(g)).toList();
          final checkedIn = guests.where((g) => g.checkedIn).toList();
          final gone = guests.where((g) => g.notComing || missed(g)).toList();

          Widget section(String title, List<Guest> list, Color color) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SectionHeader(title, count: list.length, color: color),
              Panel(
                child: Column(
                  children: [
                    for (var i = 0; i < list.length; i++) ...[
                      if (i > 0) const RowDivider(indent: 92),
                      GuestRow(
                        guest: list[i],
                        kind: list[i].kind(today: today, nowMinutes: now),
                        showHost: isAdmin,
                        onTap: () => showGuestSheet(context, guest: list[i], loader: _loader),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          );

          return AnnotatedRegion<SystemUiOverlayStyle>(
            value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
            child: SafeArea(
              bottom: false,
              child: RefreshIndicator(
                onRefresh: () => _loader.load(quiet: true),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                  children: [
                    const _FloorBanner(),
                    const SizedBox(height: 12),
                    Panel(
                      child: Column(
                        children: [
                          _DateBar(
                            label: friendlyDate(_date, today),
                            sub: _date == today ? longDate(_date) : null,
                            isToday: _date == today,
                            onPrev: () => _go(addDays(_date, -1)),
                            onNext: () => _go(addDays(_date, 1)),
                            onToday: () => _go(today),
                            onPick: _pickDate,
                          ),
                          const RowDivider(indent: 0),
                          IntrinsicHeight(
                            child: Row(
                              children: [
                                _Stat(count: toCome.length, label: 'To come', color: AppColors.expected),
                                const VerticalDivider(width: 1, color: AppColors.line),
                                _Stat(count: checkedIn.length, label: 'Checked in', color: AppColors.cleared),
                                const VerticalDivider(width: 1, color: AppColors.line),
                                _Stat(count: gone.length, label: 'Not coming', color: AppColors.idle),
                              ],
                            ),
                          ),
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
                    else if (guests.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Panel(
                          child: EmptyMessage(
                            icon: Icons.person_outline,
                            title: 'No guests on this day',
                            body: isAdmin
                                ? 'Add the guests your floor is expecting.'
                                : 'Add the guests you’re expecting.',
                          ),
                        ),
                      )
                    else ...[
                      if (toCome.isNotEmpty) section('Still to come', toCome, AppColors.expected),
                      if (checkedIn.isNotEmpty) section('Checked in', checkedIn, AppColors.cleared),
                      if (gone.isNotEmpty) section('Not coming', gone, AppColors.muted),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Arrival Desk, then this floor and its company. Tap to switch floors if you're on several.
class _FloorBanner extends StatelessWidget {
  const _FloorBanner();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final floor = session.floor;
        if (floor == null) return const SizedBox.shrink();
        final company = floor.company;
        final banner = BrandBanner(
          headline: company == null ? floor.floorName : '${floor.floorName} · $company',
          canSwitch: session.floors.length > 1,
        );
        if (session.floors.length < 2) return banner;
        return PopupMenuButton<String>(
          tooltip: 'Switch floor',
          onSelected: session.selectFloor,
          position: PopupMenuPosition.under,
          itemBuilder: (context) => [
            for (final f in session.floors)
              CheckedPopupMenuItem(value: f.id, checked: f.id == floor.id, child: Text(f.name)),
          ],
          child: banner,
        );
      },
    );
  }
}

class _DateBar extends StatelessWidget {
  const _DateBar({
    required this.label,
    required this.isToday,
    required this.onPrev,
    required this.onNext,
    required this.onToday,
    required this.onPick,
    this.sub,
  });
  final String label;
  final String? sub;
  final bool isToday;
  final VoidCallback onPrev, onNext, onToday, onPick;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
    child: Row(
      children: [
        IconButton(tooltip: 'Previous day', onPressed: onPrev, icon: const Icon(Icons.chevron_left)),
        Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: onPick,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(
                        child: Text(
                          label,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600, letterSpacing: -0.3),
                        ),
                      ),
                      const Icon(Icons.arrow_drop_down, color: AppColors.muted),
                    ],
                  ),
                  if (sub != null) Text(sub!, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                  if (!isToday)
                    GestureDetector(
                      onTap: onToday,
                      child: const Padding(
                        padding: EdgeInsets.only(top: 2),
                        child: Text(
                          'Back to today',
                          style: TextStyle(color: AppColors.signalDeep, fontSize: 12.5, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        IconButton(tooltip: 'Next day', onPressed: onNext, icon: const Icon(Icons.chevron_right)),
      ],
    ),
  );
}

class _Stat extends StatelessWidget {
  const _Stat({required this.count, required this.label, required this.color});
  final int count;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        children: [
          Text(
            '$count',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: color, height: 1.1),
          ),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
        ],
      ),
    ),
  );
}

/// One guest inside a section panel: time on the left, details in the middle.
class GuestRow extends StatelessWidget {
  const GuestRow({super.key, required this.guest, required this.kind, required this.showHost, required this.onTap});
  final Guest guest;
  final GuestKind kind;
  final bool showHost;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final gone = kind == GuestKind.gone || kind == GuestKind.missed;
    final sub = [
      if (guest.company?.isNotEmpty ?? false) guest.company!,
      if (showHost && !guest.invited) guest.mine ? 'Host: you' : 'Host: ${guest.hostName}',
      if (guest.invited) 'Invited by ${guest.hostName}',
    ].join(' · ');

    final timeNote = switch (kind) {
      GuestKind.late => const Text(
        'LATE',
        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: AppColors.signalDeep),
      ),
      GuestKind.arrived => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check, size: 13, color: AppColors.cleared),
          const SizedBox(width: 2),
          Flexible(
            child: Text(
              guest.checkedInLabel ?? '',
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.cleared),
            ),
          ),
        ],
      ),
      GuestKind.gone => Text(
        guest.status == 'NO_SHOW' ? 'No-show' : 'Cancelled',
        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.muted),
      ),
      GuestKind.missed => const Text(
        'Missed',
        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.muted),
      ),
      GuestKind.expected => null,
    };

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 76,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    guest.expectedLabel ?? 'Any time',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: gone ? AppColors.muted : (kind == GuestKind.late ? AppColors.signalDeep : AppColors.ink),
                    ),
                  ),
                  if (timeNote != null) ...[const SizedBox(height: 3), timeNote],
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    guest.guestName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: struckStyle(
                      TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: gone ? AppColors.muted : AppColors.ink,
                      ),
                      gone,
                    ),
                  ),
                  if (sub.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.muted, fontSize: 13.5),
                    ),
                  ],
                  if (guest.hasCar || (guest.notes?.isNotEmpty ?? false) || guest.notifyUsers.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (guest.hasCar)
                          _Tag(
                            icon: Icons.directions_car_outlined,
                            label: guest.licensePlate ?? guest.vehicle ?? 'Car',
                          ),
                        if (guest.notes?.isNotEmpty ?? false)
                          const _Tag(icon: Icons.sticky_note_2_outlined, label: 'Note'),
                        if (guest.notifyUsers.isNotEmpty)
                          _Tag(icon: Icons.notifications_none, label: '+${guest.notifyUsers.length} notified'),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.only(top: 2),
              child: Icon(Icons.chevron_right, color: AppColors.lineStrong),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: AppColors.panel2,
      border: Border.all(color: AppColors.line),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: AppColors.muted),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.inkSoft),
        ),
      ],
    ),
  );
}
