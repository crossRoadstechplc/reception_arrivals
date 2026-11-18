import 'package:flutter/material.dart';

import '../main.dart';
import '../session.dart';
import '../widgets.dart';
import 'calendar_screen.dart';
import 'guests_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final floor = session.floor;
        if (floor == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('Arrival Desk')),
            body: Center(
              child: EmptyMessage(
                icon: Icons.apartment_outlined,
                title: session.floors.isEmpty && session.today == null
                    ? 'Loading your floors…'
                    : 'You’re not on a floor yet',
                body: session.today == null ? null : 'Ask a super admin to add you to your floor.',
                action: OutlinedButton(
                  onPressed: () => session.refreshMe().catchError((_) {}),
                  child: const Text('Try again'),
                ),
              ),
            ),
          );
        }
        return Scaffold(
          // Guests shows the floor in its banner and Calendar has its own top bar.
          appBar: _tab == 2 ? AppBar(titleSpacing: 16, title: const Text('Settings')) : null,
          body: IndexedStack(
            index: _tab,
            children: [
              const GuestsScreen(),
              CalendarScreen(onOpenSettings: () => setState(() => _tab = 2)),
              const SettingsScreen(),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) {
              if (i == 0) guestsTabTapped.value++;
              setState(() => _tab = i);
            },
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.list_alt_outlined),
                selectedIcon: Icon(Icons.list_alt),
                label: 'Guests',
              ),
              NavigationDestination(
                icon: Icon(Icons.calendar_month_outlined),
                selectedIcon: Icon(Icons.calendar_month),
                label: 'Calendar',
              ),
              NavigationDestination(
                icon: Icon(Icons.settings_outlined),
                selectedIcon: Icon(Icons.settings),
                label: 'Settings',
              ),
            ],
          ),
        );
      },
    );
  }
}
