import 'package:flutter/material.dart';

import '../main.dart';
import '../theme.dart';
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
          // The Calendar tab draws its own calendar-style top bar.
          appBar: _tab == 1 ? null : AppBar(titleSpacing: 16, title: _FloorTitle()),
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
            onDestinationSelected: (i) => setState(() => _tab = i),
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

/// Floor name (and company), with a switcher when the person works on several floors.
class _FloorTitle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final floor = session.floor!;
    final title = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          floor.isAdmin ? 'FLOOR ADMIN' : 'MY GUESTS',
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.4,
            color: AppColors.signal,
          ),
        ),
        Text(
          floor.name,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
      ],
    );
    if (session.floors.length < 2) return title;
    return PopupMenuButton<String>(
      tooltip: 'Switch floor',
      onSelected: session.selectFloor,
      itemBuilder: (context) => [
        for (final f in session.floors)
          CheckedPopupMenuItem(value: f.id, checked: f.id == floor.id, child: Text('${f.number} · ${f.name}')),
      ],
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(child: title),
          const Icon(Icons.arrow_drop_down),
        ],
      ),
    );
  }
}
