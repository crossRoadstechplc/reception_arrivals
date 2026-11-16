import 'package:flutter/material.dart';

import '../dates.dart';
import '../guest_loader.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'guest_form_screen.dart';
import 'guest_sheet.dart';

/// One day's guests, like the website's Guests page.
class GuestsScreen extends StatefulWidget {
  const GuestsScreen({super.key});

  @override
  State<GuestsScreen> createState() => _GuestsScreenState();
}

class _GuestsScreenState extends State<GuestsScreen> {
  late String _date;
  late final GuestLoader _loader;

  @override
  void initState() {
    super.initState();
    _date = session.today ?? isoFromDate(DateTime.now());
    _loader = GuestLoader(from: _date, to: _date);
    // If we had to guess "today" from the phone, switch to the office's today once the server answers.
    var trusted = session.today != null;
    _loader.addListener(() {
      final serverToday = _loader.data?.today;
      if (trusted || serverToday == null) return;
      trusted = true;
      if (serverToday != _date) _go(serverToday);
    });
  }

  @override
  void dispose() {
    _loader.dispose();
    super.dispose();
  }

  void _go(String date) {
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
    final saved = await openGuestForm(context, date: _date.compareTo(today) < 0 ? today : _date, hosts: _loader.data?.hosts ?? []);
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
          final guests = _loader.on(_date);
          final floor = session.floor;
          final isAdmin = floor?.isAdmin ?? false;
          final expected = guests.where((g) => g.status == 'EXPECTED').length;
          final inCount = guests.where((g) => g.checkedIn).length;
          final gone = guests.where((g) => g.notComing).length;

          return RefreshIndicator(
            onRefresh: () => _loader.load(quiet: true),
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: _DateBar(
                    label: friendlyDate(_date, today),
                    sub: _date == today ? longDate(_date) : null,
                    isToday: _date == today,
                    onPrev: () => _go(addDays(_date, -1)),
                    onNext: () => _go(addDays(_date, 1)),
                    onToday: () => _go(today),
                    onPick: _pickDate,
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                    child: Row(
                      children: [
                        _Stat(count: expected, label: 'Expected', color: AppColors.expected, bg: AppColors.expectedSoft),
                        const SizedBox(width: 8),
                        _Stat(count: inCount, label: 'Checked in', color: AppColors.cleared, bg: AppColors.clearedSoft),
                        const SizedBox(width: 8),
                        _Stat(count: gone, label: 'Not coming', color: AppColors.idle, bg: AppColors.idleSoft),
                      ],
                    ),
                  ),
                ),
                if (_loader.error != null)
                  SliverToBoxAdapter(child: ErrorBanner(message: _loader.error!, onRetry: _loader.load)),
                if (_loader.data == null && _loader.loading)
                  const SliverFillRemaining(child: Center(child: CircularProgressIndicator()))
                else if (guests.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: EmptyMessage(
                      icon: Icons.person_outline,
                      title: 'No guests on this day',
                      body: isAdmin ? 'Add the guests your floor is expecting.' : 'Add the guests you’re expecting.',
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                    sliver: SliverList.separated(
                      itemCount: guests.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final guest = guests[i];
                        return GuestCard(
                          guest: guest,
                          kind: guest.kind(today: today, nowMinutes: _loader.nowMinutes),
                          showHost: isAdmin,
                          onTap: () => showGuestSheet(context, guest: guest, loader: _loader),
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
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
        padding: const EdgeInsets.fromLTRB(8, 12, 12, 8),
        child: Row(
          children: [
            IconButton(tooltip: 'Previous day', onPressed: onPrev, icon: const Icon(Icons.chevron_left)),
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: onPick,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(label,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, letterSpacing: -0.3)),
                          ),
                          const Icon(Icons.arrow_drop_down, color: AppColors.muted),
                        ],
                      ),
                      if (sub != null) Text(sub!, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                    ],
                  ),
                ),
              ),
            ),
            if (!isToday) TextButton(onPressed: onToday, child: const Text('Today')),
            IconButton(tooltip: 'Next day', onPressed: onNext, icon: const Icon(Icons.chevron_right)),
          ],
        ),
      );
}

class _Stat extends StatelessWidget {
  const _Stat({required this.count, required this.label, required this.color, required this.bg});
  final int count;
  final String label;
  final Color color, bg;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$count', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: color)),
              Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
            ],
          ),
        ),
      );
}

/// A guest in the day list.
class GuestCard extends StatelessWidget {
  const GuestCard({super.key, required this.guest, required this.kind, required this.showHost, required this.onTap});
  final Guest guest;
  final GuestKind kind;
  final bool showHost;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final gone = kind == GuestKind.gone;
    final sub = [
      if (guest.company?.isNotEmpty ?? false) guest.company!,
      if (showHost) 'Host: ${guest.mine ? 'You' : guest.hostName}',
    ].join(' · ');
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 72,
                child: Text(
                  guest.expectedLabel ?? 'Any time',
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: kind == GuestKind.late ? AppColors.signalDeep : (gone ? AppColors.muted : AppColors.ink),
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          guest.guestName,
                          style: struckStyle(
                            TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: gone ? AppColors.muted : AppColors.ink),
                            gone,
                          ),
                        ),
                        StatusBadge(guest: guest, late: kind == GuestKind.late),
                      ],
                    ),
                    if (sub.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(sub, style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
                    ],
                    if (guest.checkedIn && guest.checkedInLabel != null) ...[
                      const SizedBox(height: 2),
                      Text('Checked in at ${guest.checkedInLabel}',
                          style: const TextStyle(color: AppColors.cleared, fontWeight: FontWeight.w600, fontSize: 13.5)),
                    ],
                    if (guest.hasCar) ...[const SizedBox(height: 6), CarLine(guest: guest)],
                    if (guest.notes?.isNotEmpty ?? false) ...[
                      const SizedBox(height: 6),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.sticky_note_2_outlined, size: 15, color: AppColors.muted),
                          const SizedBox(width: 6),
                          Expanded(child: Text(guest.notes!, style: const TextStyle(fontSize: 12.5, color: AppColors.muted))),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.lineStrong),
            ],
          ),
        ),
      ),
    );
  }
}
