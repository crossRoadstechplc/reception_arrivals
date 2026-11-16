import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'notifications.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'session.dart';
import 'theme.dart';

final session = Session();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await alerts.init();
  session.onSignedIn = alerts.attach;
  session.onSigningOut = alerts.detach;
  await session.restore();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent));
  runApp(const ArrivalDeskApp());
}

class ArrivalDeskApp extends StatefulWidget {
  const ArrivalDeskApp({super.key});

  @override
  State<ArrivalDeskApp> createState() => _ArrivalDeskAppState();
}

class _ArrivalDeskAppState extends State<ArrivalDeskApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Back in the app: reload guests and re-check alert permission (it may have changed in Settings).
    if (state == AppLifecycleState.resumed && session.signedIn) {
      requestRefresh();
      alerts.recheck();
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Arrival Desk',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          if (!session.ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          return session.signedIn ? const HomeScreen() : const LoginScreen();
        },
      ),
    );
  }
}
