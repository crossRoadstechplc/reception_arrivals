/// Where the Arrival Desk website (and its /api/mobile routes) lives.
///
/// Override when building, e.g. for a local server on the emulator:
///   flutter run --dart-define=API_URL=http://10.0.2.2:3000
const String apiBaseUrl = String.fromEnvironment('API_URL', defaultValue: 'https://reception-arrivals-kqkl.vercel.app');
