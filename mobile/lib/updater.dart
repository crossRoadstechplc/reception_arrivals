import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:ota_update/ota_update.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'config.dart';
import 'theme.dart';

/// A newer app version published with mobile/release.ps1.
class AppRelease {
  AppRelease({
    required this.versionName,
    required this.buildNumber,
    required this.downloadUrl,
    this.notes = '',
    this.sha256,
    this.size,
  });

  final String versionName;
  final int buildNumber;
  final String downloadUrl;
  final String notes;
  final String? sha256;
  final int? size;
}

/// Checks the website for a newer app version, and downloads + opens the installer.
class Updater extends ChangeNotifier {
  String installedVersion = '';
  int installedBuild = 0;
  AppRelease? available;
  DateTime? _lastCheck;
  final Set<int> _prompted = {};

  /// Download progress 0–100 while updating, otherwise null.
  int? progress;
  String? status;

  bool get updating => progress != null;

  Future<void> init() async {
    final info = await PackageInfo.fromPlatform();
    installedVersion = info.version;
    installedBuild = int.tryParse(info.buildNumber) ?? 0;
  }

  /// Ask the server for the newest version. Throttled unless [force].
  /// Returns the newer release, or null if this is the newest.
  Future<AppRelease?> check({bool force = false}) async {
    final last = _lastCheck;
    if (!force && last != null && DateTime.now().difference(last) < const Duration(minutes: 30)) return available;
    _lastCheck = DateTime.now();
    try {
      final response = await http
          .get(Uri.parse('$apiBaseUrl/api/mobile/app-version'), headers: {'accept': 'application/json'})
          .timeout(const Duration(seconds: 15));
      if (response.statusCode != 200) {
        if (force) throw Exception('Couldn’t check for updates right now.');
        return available;
      }
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (data['available'] != true) {
        available = null;
      } else {
        final release = AppRelease(
          versionName: data['versionName'] as String,
          buildNumber: (data['buildNumber'] as num).toInt(),
          downloadUrl: data['downloadUrl'] as String,
          notes: data['notes'] as String? ?? '',
          sha256: data['sha256'] as String?,
          size: (data['size'] as num?)?.toInt(),
        );
        available = release.buildNumber > installedBuild ? release : null;
      }
      notifyListeners();
      return available;
    } catch (error) {
      if (force) rethrow;
      return available; // offline etc.: try again later
    }
  }

  /// Check, and if there's a new version show the "Update available" dialog
  /// (once per version per app session, unless [force]).
  Future<void> checkAndPrompt(BuildContext? Function() context, {bool force = false}) async {
    AppRelease? release;
    try {
      release = await check(force: force);
    } catch (error) {
      final ctx = context();
      if (force && ctx != null && ctx.mounted) _snack(ctx, error.toString().replaceFirst('Exception: ', ''));
      return;
    }
    final ctx = context();
    if (ctx == null || !ctx.mounted) return;
    if (release == null) {
      if (force) _snack(ctx, 'You have the latest version ($installedVersion).');
      return;
    }
    if (!force && _prompted.contains(release.buildNumber)) return;
    _prompted.add(release.buildNumber);
    await showUpdateDialog(ctx, release);
  }

  Future<void> showUpdateDialog(BuildContext context, AppRelease release) {
    return showDialog<void>(
      context: context,
      builder: (dialogContext) => ListenableBuilder(
        listenable: this,
        builder: (dialogContext, _) {
          final busy = updating;
          return AlertDialog(
            icon: const Icon(Icons.system_update, color: AppColors.signal, size: 32),
            title: Text(busy ? 'Updating…' : 'Update available'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Arrival Desk ${release.versionName} is ready. You have $installedVersion.',
                  style: const TextStyle(fontWeight: FontWeight.w500),
                ),
                if (release.notes.isNotEmpty && !busy) ...[
                  const SizedBox(height: 12),
                  const Text('What’s new', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  const SizedBox(height: 4),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 180),
                    child: SingleChildScrollView(
                      child: Text(release.notes, style: const TextStyle(color: AppColors.muted)),
                    ),
                  ),
                ],
                if (busy) ...[
                  const SizedBox(height: 16),
                  LinearProgressIndicator(value: (progress ?? 0) / 100, color: AppColors.signal),
                  const SizedBox(height: 8),
                  Text(status ?? '', style: const TextStyle(color: AppColors.muted)),
                ] else if (status != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    status!,
                    style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w500),
                  ),
                ],
              ],
            ),
            actions: [
              if (!busy) TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('Later')),
              if (!busy) FilledButton(onPressed: () => _install(release), child: const Text('Update now')),
            ],
          );
        },
      ),
    ).whenComplete(() {
      if (!updating) status = null;
    });
  }

  void _install(AppRelease release) {
    progress = 0;
    status = 'Downloading…';
    notifyListeners();
    try {
      OtaUpdate()
          .execute(
            release.downloadUrl,
            destinationFilename: 'arrival-desk-${release.buildNumber}.apk',
            sha256checksum: release.sha256,
          )
          .listen(
            (event) {
              switch (event.status) {
                case OtaStatus.DOWNLOADING:
                  progress = int.tryParse(event.value ?? '') ?? progress;
                  status = 'Downloading… ${progress ?? 0}%';
                case OtaStatus.INSTALLING:
                case OtaStatus.INSTALLATION_DONE:
                  // Android's installer takes over from here.
                  progress = null;
                  status = 'Tap “Update” on the next screen to finish.';
                case OtaStatus.PERMISSION_NOT_GRANTED_ERROR:
                  progress = null;
                  status =
                      'Allow Arrival Desk to install apps (Settings › Apps › Special app access › '
                      'Install unknown apps), then tap Update now again.';
                case OtaStatus.CHECKSUM_ERROR:
                  progress = null;
                  status = 'The download was damaged. Try again.';
                case OtaStatus.DOWNLOAD_ERROR:
                  progress = null;
                  status = 'The download failed. Check your connection and try again.';
                default:
                  progress = null;
                  status = 'Couldn’t install the update (${event.status.name}). Try again.';
              }
              notifyListeners();
            },
            onError: (Object error) {
              progress = null;
              status = 'Couldn’t download the update. Try again.';
              notifyListeners();
            },
          );
    } catch (error) {
      progress = null;
      status = 'Couldn’t start the update. Try again.';
      notifyListeners();
    }
  }

  void _snack(BuildContext context, String message) {
    ScaffoldMessenger.maybeOf(context)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
}

final updater = Updater();
