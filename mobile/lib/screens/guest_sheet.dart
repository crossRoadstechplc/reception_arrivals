import 'package:flutter/material.dart';

import '../dates.dart';
import '../guest_loader.dart';
import '../main.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'guest_form_screen.dart';

/// Details and actions for one guest, as a bottom sheet.
Future<void> showGuestSheet(
  BuildContext context, {
  required Guest guest,
  required GuestLoader loader,
  void Function(String date)? onShowDate,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.panel,
    builder: (sheetContext) => _GuestSheet(guest: guest, loader: loader, hostContext: context, onShowDate: onShowDate),
  );
}

class _GuestSheet extends StatefulWidget {
  const _GuestSheet({required this.guest, required this.loader, required this.hostContext, this.onShowDate});
  final Guest guest;
  final GuestLoader loader;

  /// Moves the screen to a guest's new date after an edit.
  final void Function(String date)? onShowDate;

  /// The screen behind the sheet, for messages after the sheet closes.
  final BuildContext hostContext;

  @override
  State<_GuestSheet> createState() => _GuestSheetState();
}

class _GuestSheetState extends State<_GuestSheet> {
  bool _busy = false;
  String? _error;

  Guest get g => widget.guest;

  Future<void> _run(Future<void> Function() action, String done, {VoidCallback? undo}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      requestRefresh();
      if (!mounted) return;
      Navigator.of(context).pop();
      if (widget.hostContext.mounted) {
        showMessage(widget.hostContext, done, actionLabel: undo != null ? 'Undo' : null, onAction: undo);
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _setStatus(String status) {
    final api = session.api;
    _run(
      () => api.setStatus(g.id, status),
      status == 'CANCELLED' ? '${g.guestName}’s visit cancelled' : '${g.guestName} restored',
      undo: () async {
        try {
          await api.setStatus(g.id, status == 'CANCELLED' ? 'EXPECTED' : 'CANCELLED');
        } catch (_) {}
        requestRefresh();
      },
    );
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete ${g.guestName}?'),
        content: const Text('This removes the guest from the list for good. It can’t be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok == true) _run(() => session.api.deleteGuest(g.id), '${g.guestName} deleted');
  }

  Future<void> _edit() async {
    final loader = widget.loader;
    final hostContext = widget.hostContext;
    final onShowDate = widget.onShowDate;
    Navigator.of(context).pop();
    final saved = await openGuestForm(hostContext, date: g.visitDate, guest: g, data: loader.data);
    if (saved != null && saved != g.visitDate) onShowDate?.call(saved);
  }

  @override
  Widget build(BuildContext context) {
    final loader = widget.loader;
    final kind = g.kind(today: loader.today, nowMinutes: loader.nowMinutes);
    final isAdmin = session.floor?.isAdmin ?? false;
    final square = switch (kind) {
      GuestKind.expected => AppColors.expected,
      GuestKind.late => AppColors.signalDeep,
      GuestKind.arrived => AppColors.cleared,
      GuestKind.gone || GuestKind.missed => AppColors.lineStrong,
    };
    final day = g.visitDate == loader.today ? 'Today, ${longDate(g.visitDate)}' : longDate(g.visitDate);
    final when = '$day · ${g.expectedLabel ?? 'Any time'}';
    final canCancel = g.canEdit && g.status == 'EXPECTED';
    final canRestore = g.canEdit && g.status == 'CANCELLED';
    final canDelete = g.canEdit && g.notComing;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 12, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top actions, like a calendar event.
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (g.editable)
                  IconButton(
                    tooltip: 'Edit guest',
                    onPressed: _busy ? null : _edit,
                    icon: const Icon(Icons.edit_outlined),
                  ),
                if (canDelete || canRestore)
                  PopupMenuButton<String>(
                    tooltip: 'More',
                    icon: const Icon(Icons.more_vert),
                    onSelected: (v) => v == 'delete' ? _delete() : _setStatus('EXPECTED'),
                    itemBuilder: (_) => [
                      if (canRestore) const PopupMenuItem(value: 'restore', child: Text('Restore visit')),
                      if (canDelete) const PopupMenuItem(value: 'delete', child: Text('Delete guest')),
                    ],
                  ),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 18,
                    height: 18,
                    margin: const EdgeInsets.only(top: 8, right: 18, left: 2),
                    decoration: BoxDecoration(color: square, borderRadius: BorderRadius.circular(5)),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          g.guestName,
                          style: struckStyle(
                            const TextStyle(fontSize: 24, fontWeight: FontWeight.w400),
                            KindStyle.struck(kind),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(when, style: const TextStyle(color: AppColors.muted, fontSize: 14.5)),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            StatusBadge(guest: g, late: kind == GuestKind.late, missed: kind == GuestKind.missed),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            if (g.checkedIn && g.checkedInLabel != null)
              _DetailRow(
                icon: Icons.check_circle_outline,
                color: AppColors.cleared,
                title: 'Arrived at ${g.checkedInLabel}',
              ),
            if (g.company?.isNotEmpty ?? false)
              _DetailRow(icon: Icons.business_outlined, title: g.company!, sub: 'Company'),
            _DetailRow(
              icon: Icons.person_outline,
              title: g.mine ? 'You' : g.hostName,
              sub: g.invited
                  ? 'Host · they invited you'
                  : (g.mine && !isAdmin
                        ? 'You’re the host · you get an alert on arrival'
                        : 'Host · gets an alert on arrival'),
            ),
            if (g.notifyUsers.isNotEmpty)
              _DetailRow(
                icon: Icons.notifications_none,
                title: g.notifyUsers.map((u) => u.id == session.user?.id ? 'You' : u.name).join(', '),
                sub: 'Also notified on arrival',
              ),
            if (g.hasCar)
              _DetailRow(
                icon: Icons.directions_car_outlined,
                title: (g.vehicle?.isNotEmpty ?? false) ? g.vehicle! : 'Coming by car',
                child: (g.licensePlate?.isNotEmpty ?? false)
                    ? Padding(padding: const EdgeInsets.only(top: 6), child: PlateTag(g.licensePlate!, large: true))
                    : null,
              ),
            if (g.notes?.isNotEmpty ?? false) _DetailRow(icon: Icons.notes_outlined, title: g.notes!),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w500),
              ),
            ],
            if (canCancel || g.editable || canRestore) ...[
              const SizedBox(height: 16),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Row(
                  children: [
                    if (canCancel)
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _busy ? null : () => _setStatus('CANCELLED'),
                          style: OutlinedButton.styleFrom(shape: const StadiumBorder()),
                          child: const Text('Cancel visit'),
                        ),
                      ),
                    if (canRestore)
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : () => _setStatus('EXPECTED'),
                          style: OutlinedButton.styleFrom(shape: const StadiumBorder()),
                          icon: const Icon(Icons.undo),
                          label: const Text('Restore visit'),
                        ),
                      ),
                    if ((canCancel || canRestore) && g.editable) const SizedBox(width: 10),
                    if (g.editable)
                      Expanded(
                        child: FilledButton(
                          onPressed: _busy ? null : _edit,
                          style: FilledButton.styleFrom(shape: const StadiumBorder()),
                          child: const Text('Edit'),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.icon, required this.title, this.sub, this.child, this.color = AppColors.muted});
  final IconData icon;
  final String title;
  final String? sub;
  final Widget? child;
  final Color color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 9),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 18),
          child: Icon(icon, color: color, size: 22),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 15)),
              if (sub != null) Text(sub!, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
              ?child,
            ],
          ),
        ),
      ],
    ),
  );
}
