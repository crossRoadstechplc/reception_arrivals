import 'package:flutter/material.dart';

import '../guest_loader.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'guest_form_screen.dart';

/// Details and actions for one guest, as a bottom sheet.
Future<void> showGuestSheet(BuildContext context, {required Guest guest, required GuestLoader loader}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.panel,
    builder: (sheetContext) => _GuestSheet(guest: guest, loader: loader, hostContext: context),
  );
}

class _GuestSheet extends StatefulWidget {
  const _GuestSheet({required this.guest, required this.loader, required this.hostContext});
  final Guest guest;
  final GuestLoader loader;

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
      widget.loader.load(quiet: true);
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
    final loader = widget.loader;
    _run(
      () => api.setStatus(g.id, status),
      status == 'CANCELLED' ? '${g.guestName}’s visit cancelled' : '${g.guestName} restored',
      undo: () async {
        try {
          await api.setStatus(g.id, status == 'CANCELLED' ? 'EXPECTED' : 'CANCELLED');
        } catch (_) {}
        loader.load(quiet: true);
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
    Navigator.of(context).pop();
    final saved = await openGuestForm(hostContext, date: g.visitDate, guest: g, hosts: loader.data?.hosts ?? []);
    if (saved) loader.load(quiet: true);
  }

  @override
  Widget build(BuildContext context) {
    final loader = widget.loader;
    final kind = g.kind(today: loader.today, nowMinutes: loader.nowMinutes);
    final isAdmin = session.floor?.isAdmin ?? false;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              g.guestName,
              style: struckStyle(const TextStyle(fontSize: 22, fontWeight: FontWeight.w600), KindStyle.struck(kind)),
            ),
            if (g.company?.isNotEmpty ?? false)
              Text(g.company!, style: const TextStyle(color: AppColors.muted, fontSize: 15)),
            const SizedBox(height: 10),
            Row(children: [StatusBadge(guest: g, late: kind == GuestKind.late)]),
            const SizedBox(height: 16),
            _Facts(rows: [
              ('Expected', g.expectedLabel ?? 'Any time'),
              ('Arrived', g.checkedIn ? (g.checkedInLabel ?? 'Yes') : 'Not yet'),
              if (isAdmin) ('Host', g.mine ? 'You (${g.hostName})' : g.hostName),
            ]),
            if (g.hasCar) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.panel2,
                  border: Border.all(color: AppColors.line),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.directions_car_outlined, color: AppColors.muted),
                    const SizedBox(width: 10),
                    if (g.licensePlate?.isNotEmpty ?? false) ...[PlateTag(g.licensePlate!, large: true), const SizedBox(width: 10)],
                    if (g.vehicle?.isNotEmpty ?? false)
                      Expanded(child: Text(g.vehicle!, style: const TextStyle(fontWeight: FontWeight.w500))),
                  ],
                ),
              ),
            ],
            if (g.notes?.isNotEmpty ?? false) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.expectedSoft, borderRadius: BorderRadius.circular(12)),
                child: Text(g.notes!, style: const TextStyle(color: AppColors.expected)),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w500)),
            ],
            const SizedBox(height: 20),
            if (g.editable)
              FilledButton.icon(
                onPressed: _busy ? null : _edit,
                icon: const Icon(Icons.edit_outlined),
                label: const Text('Edit guest'),
              ),
            if (g.canEdit && g.status == 'EXPECTED') ...[
              const SizedBox(height: 8),
              OutlinedButton(onPressed: _busy ? null : () => _setStatus('CANCELLED'), child: const Text('Cancel visit')),
            ],
            if (g.canEdit && g.status == 'CANCELLED') ...[
              FilledButton.icon(
                onPressed: _busy ? null : () => _setStatus('EXPECTED'),
                icon: const Icon(Icons.undo),
                label: const Text('Restore visit'),
              ),
              const SizedBox(height: 8),
            ],
            if (g.canEdit && g.notComing)
              TextButton.icon(
                onPressed: _busy ? null : _delete,
                style: TextButton.styleFrom(foregroundColor: AppColors.danger, minimumSize: const Size(48, 48)),
                icon: const Icon(Icons.delete_outline),
                label: const Text('Delete guest'),
              ),
          ],
        ),
      ),
    );
  }
}

class _Facts extends StatelessWidget {
  const _Facts({required this.rows});
  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          for (final (label, value) in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                children: [
                  SizedBox(width: 90, child: Text(label, style: const TextStyle(color: AppColors.muted))),
                  Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
                ],
              ),
            ),
        ],
      );
}
