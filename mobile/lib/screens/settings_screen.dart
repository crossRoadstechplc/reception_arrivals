import 'package:flutter/material.dart';

import '../main.dart';
import '../notifications.dart';
import '../session.dart';
import '../theme.dart';
import '../updater.dart';
import '../widgets.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([session, alerts, updater]),
      builder: (context, _) {
        final user = session.user;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                leading: CircleAvatar(
                  backgroundColor: AppColors.idleSoft,
                  foregroundColor: AppColors.ink,
                  child: Text(_initials(user?.displayName ?? '')),
                ),
                title: Text(user?.displayName ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(user?.email ?? ''),
              ),
            ),
            const SizedBox(height: 16),
            const _SectionTitle('Your floors'),
            Card(
              child: Column(
                children: [
                  for (final f in session.floors)
                    ListTile(
                      leading: Container(
                        width: 34,
                        height: 34,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(8)),
                        child: Text(
                          '${f.number}',
                          style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                        ),
                      ),
                      title: Text(f.name),
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: f.isAdmin ? AppColors.adminSoft : AppColors.expectedSoft,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          f.isAdmin ? 'Floor admin' : 'Floor staff',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            color: f.isAdmin ? AppColors.admin : AppColors.expected,
                          ),
                        ),
                      ),
                      selected: f.id == session.floor?.id,
                      selectedTileColor: AppColors.panel2,
                      onTap: () => session.selectFloor(f.id),
                    ),
                ],
              ),
            ),
            if ((session.floor?.isAdmin ?? false) && (session.floor?.roomBookingAvailable ?? false)) ...[
              const SizedBox(height: 16),
              const _SectionTitle('Floor settings'),
              Card(clipBehavior: Clip.antiAlias, child: _RoomBookingTile(key: ValueKey(session.floor!.id))),
            ],
            const SizedBox(height: 16),
            const _SectionTitle('Notifications'),
            Card(
              clipBehavior: Clip.antiAlias,
              child: ListTile(
                leading: const Icon(Icons.notifications_none),
                title: const Text('Arrival alerts', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(_alertSummary(alerts.state)),
                trailing: const Icon(Icons.chevron_right, color: AppColors.lineStrong),
                onTap: () =>
                    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const _NotificationsScreen())),
              ),
            ),
            const SizedBox(height: 16),
            const _SectionTitle('App'),
            Card(
              child: Column(
                children: [
                  if (updater.available != null)
                    ListTile(
                      leading: const Icon(Icons.system_update, color: AppColors.signal),
                      title: Text(
                        'Update to ${updater.available!.versionName}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: const Text('A newer version is ready to install.'),
                      onTap: () => updater.showUpdateDialog(context, updater.available!),
                    ),
                  ListTile(
                    leading: const Icon(Icons.info_outline),
                    title: Text('Version ${updater.installedVersion} (${updater.installedBuild})'),
                    trailing: TextButton(
                      onPressed: () => updater.checkAndPrompt(() => context, force: true),
                      child: const Text('Check for updates'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Sign out?'),
                    content: const Text('You won’t get arrival alerts on this phone until you sign in again.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                      TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
                    ],
                  ),
                );
                if (ok == true) await session.signOut();
              },
              icon: const Icon(Icons.logout),
              label: const Text('Sign out'),
            ),
          ],
        );
      },
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
  }
}

String _alertSummary(AlertState state) => switch (state) {
  AlertState.on => 'On',
  AlertState.off => 'Off',
  AlertState.blocked => 'Blocked in phone settings',
  AlertState.notSetUp || AlertState.serverNotSetUp => 'Not set up',
};

/// Floor admins: offer a meeting room on this floor's guest form, or stop offering it.
class _RoomBookingTile extends StatefulWidget {
  const _RoomBookingTile({super.key});

  @override
  State<_RoomBookingTile> createState() => _RoomBookingTileState();
}

class _RoomBookingTileState extends State<_RoomBookingTile> {
  bool _busy = false;

  Future<void> _set(bool enabled) async {
    final floor = session.floor;
    if (floor == null) return;
    setState(() => _busy = true);
    try {
      await session.api.setRoomBooking(floor.id, enabled);
      await session.refreshMe();
      requestRefresh();
    } catch (error) {
      if (mounted) showMessage(context, error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final on = session.floor?.roomBookingOn ?? false;
    return SwitchListTile(
      value: on,
      onChanged: _busy ? null : _set,
      secondary: const Icon(Icons.meeting_room_outlined),
      title: const Text('Meeting room booking', style: TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(on ? 'Hosts can book a room when they add a guest' : 'The guest form doesn’t offer a room'),
    );
  }
}

/// Arrival alert controls, opened from Settings.
class _NotificationsScreen extends StatelessWidget {
  const _NotificationsScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: ListenableBuilder(
        listenable: alerts,
        builder: (context, _) => ListView(padding: const EdgeInsets.all(16), children: const [_AlertsCard()]),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4, bottom: 8),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.muted),
    ),
  );
}

class _AlertsCard extends StatefulWidget {
  const _AlertsCard();

  @override
  State<_AlertsCard> createState() => _AlertsCardState();
}

class _AlertsCardState extends State<_AlertsCard> {
  bool _busy = false;
  bool _help = false;

  Future<void> _do(Future<String?> Function() action) async {
    setState(() => _busy = true);
    final message = await action();
    if (!mounted) return;
    setState(() => _busy = false);
    if (message != null) showMessage(context, message);
  }

  @override
  Widget build(BuildContext context) {
    final state = alerts.state;
    final (icon, color, title, body) = switch (state) {
      AlertState.on => (
        Icons.notifications_active,
        AppColors.cleared,
        'Alerts are on',
        'This phone pings you, with the arrival chime, when reception checks in your guest. You also get an email.',
      ),
      AlertState.off => (
        Icons.notifications_off_outlined,
        AppColors.muted,
        'Alerts are off',
        'Turn them on to get a ping when your guests arrive. You still get an email.',
      ),
      AlertState.blocked => (
        Icons.notifications_off,
        AppColors.danger,
        'Notifications are blocked',
        'Allow notifications for Arrival Desk in the phone’s settings, then come back here.',
      ),
      AlertState.notSetUp => (
        Icons.info_outline,
        AppColors.expected,
        'Alerts aren’t set up in this app yet',
        'This build has no Firebase file. You’ll still get an email when your guests arrive.',
      ),
      AlertState.serverNotSetUp => (
        Icons.info_outline,
        AppColors.expected,
        'Alerts aren’t set up on the server yet',
        'Ask your admin to add the Firebase key. You’ll still get an email when your guests arrive.',
      ),
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: color),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                      const SizedBox(height: 2),
                      Text(body, style: const TextStyle(color: AppColors.muted)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (state == AlertState.off || state == AlertState.blocked)
              FilledButton(
                onPressed: _busy ? null : () => _do(alerts.turnOn),
                child: Text(state == AlertState.blocked ? 'Try again' : 'Turn on alerts'),
              ),
            if (state == AlertState.on) ...[
              FilledButton.icon(
                onPressed: _busy
                    ? null
                    : () => _do(() async {
                        try {
                          return await session.api.sendTestAlert();
                        } catch (e) {
                          return e.toString();
                        }
                      }),
                icon: const Icon(Icons.send_outlined),
                label: const Text('Send a test alert'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _busy
                    ? null
                    : () => _do(() async {
                        await alerts.turnOff();
                        return 'Alerts turned off on this phone.';
                      }),
                child: const Text('Turn off'),
              ),
            ],
            if (state == AlertState.on || state == AlertState.blocked) ...[
              TextButton(
                onPressed: () => setState(() => _help = !_help),
                child: Text(_help ? 'Hide tips' : 'Not getting alerts?'),
              ),
              if (_help)
                const Text(
                  '1. Settings › Apps › Arrival Desk › Notifications: turn them on, and set “Guest arrivals” to '
                  'pop on screen with sound.\n'
                  '2. Settings › Apps › Arrival Desk › Battery: choose “Unrestricted”. Many phones hold alerts '
                  'back while the screen is off otherwise.\n'
                  '3. Turn off Do Not Disturb, or allow Arrival Desk in it.\n'
                  '4. Tap “Send a test alert”.',
                  style: TextStyle(color: AppColors.inkSoft, height: 1.45),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
