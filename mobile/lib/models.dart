/// Data from the /api/mobile routes. Time text (e.g. "2:30 PM") is made on the
/// server, so every phone shows the same thing whatever its clock settings.
library;

class AppUser {
  AppUser({required this.id, this.name, this.email});
  final String id;
  final String? name;
  final String? email;

  String get displayName => (name?.trim().isNotEmpty ?? false) ? name!.trim() : (email ?? 'You');

  factory AppUser.fromJson(Map<String, dynamic> json) =>
      AppUser(id: json['id'] as String, name: json['name'] as String?, email: json['email'] as String?);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'email': email};
}

class Floor {
  Floor({required this.id, required this.name, required this.number, required this.role});
  final String id;

  /// "6th Floor · SPX" (floor name and the company on it).
  final String name;
  final int number;

  /// "ADMIN" (sees the whole floor) or "MEMBER" (own guests only).
  final String role;

  bool get isAdmin => role == 'ADMIN';
  String get roleLabel => isAdmin ? 'Floor admin' : 'Floor staff';

  /// "6th Floor" from "6th Floor · SPX".
  String get floorName => name.split(' · ').first;

  /// "SPX" from "6th Floor · SPX", or null when the floor has no company set.
  String? get company {
    final at = name.indexOf(' · ');
    return at < 0 ? null : name.substring(at + 3);
  }

  factory Floor.fromJson(Map<String, dynamic> json) => Floor(
    id: json['id'] as String,
    name: json['name'] as String,
    number: (json['number'] as num).toInt(),
    role: json['role'] as String,
  );
}

class Host {
  Host({required this.id, required this.name});
  final String id;
  final String name;
  factory Host.fromJson(Map<String, dynamic> json) => Host(id: json['id'] as String, name: json['name'] as String);
}

enum GuestKind { expected, late, arrived, gone, missed }

class Guest {
  Guest({
    required this.id,
    required this.visitDate,
    required this.guestName,
    required this.hostName,
    required this.status,
    required this.mine,
    required this.canEdit,
    this.company,
    this.hostUserId,
    this.expectedArrival,
    this.expectedLabel,
    this.checkedInLabel,
    this.notes,
    this.licensePlate,
    this.vehicle,
    this.notifyUsers = const [],
    this.invited = false,
  });

  final String id;
  final String visitDate;
  final String guestName;
  final String? company;
  final String hostName;
  final String? hostUserId;

  /// "14:30" (24-hour) or null for "any time".
  final String? expectedArrival;
  final String? expectedLabel;
  final String? checkedInLabel;

  /// EXPECTED, ARRIVED, CLEARED, CANCELLED or NO_SHOW.
  final String status;
  final String? notes;
  final String? licensePlate;
  final String? vehicle;
  final bool mine;
  final bool canEdit;

  /// Colleagues on the "Also notify" list.
  final List<Host> notifyUsers;

  /// You see this guest only because you're on its "Also notify" list.
  final bool invited;

  bool get checkedIn => status == 'ARRIVED' || status == 'CLEARED';
  bool get notComing => status == 'CANCELLED' || status == 'NO_SHOW';
  bool get hasCar => (licensePlate?.isNotEmpty ?? false) || (vehicle?.isNotEmpty ?? false);

  /// Same rule as the website: once reception checked them in (or it's off), no edits.
  bool get editable => canEdit && (status == 'EXPECTED' || status == 'ARRIVED');

  /// Minutes since midnight of the expected time, or null.
  int? get expectedMinutes {
    final value = expectedArrival;
    if (value == null) return null;
    final parts = value.split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    return h == null || m == null ? null : h * 60 + m;
  }

  GuestKind kind({required String today, required int nowMinutes}) {
    if (checkedIn) return GuestKind.arrived;
    if (notComing) return GuestKind.gone;
    // The day has passed and reception never checked them in.
    if (visitDate.compareTo(today) < 0) return GuestKind.missed;
    final expected = expectedMinutes;
    if (visitDate == today && expected != null && expected < nowMinutes) return GuestKind.late;
    return GuestKind.expected;
  }

  String get statusLabel => switch (status) {
    'ARRIVED' || 'CLEARED' => 'Checked in',
    'CANCELLED' => 'Cancelled',
    'NO_SHOW' => 'No-show',
    _ => 'Expected',
  };

  factory Guest.fromJson(Map<String, dynamic> json) => Guest(
    id: json['id'] as String,
    visitDate: json['visitDate'] as String,
    guestName: json['guestName'] as String,
    company: json['company'] as String?,
    hostName: json['hostName'] as String,
    hostUserId: json['hostUserId'] as String?,
    expectedArrival: json['expectedArrival'] as String?,
    expectedLabel: json['expectedLabel'] as String?,
    checkedInLabel: json['checkedInLabel'] as String?,
    status: json['status'] as String,
    notes: json['notes'] as String?,
    licensePlate: json['licensePlate'] as String?,
    vehicle: json['vehicle'] as String?,
    mine: json['mine'] as bool? ?? false,
    canEdit: json['canEdit'] as bool? ?? false,
    notifyUsers: ((json['notifyUsers'] as List?) ?? const [])
        .map((e) => Host.fromJson(e as Map<String, dynamic>))
        .toList(),
    invited: json['invited'] as bool? ?? false,
  );
}

class GuestRange {
  GuestRange({
    required this.today,
    required this.officeMinutes,
    required this.floor,
    required this.hosts,
    required this.guests,
    this.people = const [],
  });

  final String today;

  /// Office time when the server answered, in minutes since midnight.
  final int officeMinutes;
  final Floor floor;
  final List<Host> hosts;
  final List<Guest> guests;

  /// Everyone on the floor, for "Also notify".
  final List<Host> people;

  factory GuestRange.fromJson(Map<String, dynamic> json) => GuestRange(
    today: json['today'] as String,
    officeMinutes: (json['officeMinutes'] as num).toInt(),
    floor: Floor.fromJson(json['floor'] as Map<String, dynamic>),
    hosts: (json['hosts'] as List).map((e) => Host.fromJson(e as Map<String, dynamic>)).toList(),
    guests: (json['guests'] as List).map((e) => Guest.fromJson(e as Map<String, dynamic>)).toList(),
    people: ((json['people'] as List?) ?? const []).map((e) => Host.fromJson(e as Map<String, dynamic>)).toList(),
  );
}

class Me {
  Me({required this.user, required this.floors, required this.today, required this.alertsAvailable});
  final AppUser user;
  final List<Floor> floors;
  final String today;
  final bool alertsAvailable;

  factory Me.fromJson(Map<String, dynamic> json) => Me(
    user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
    floors: (json['floors'] as List).map((e) => Floor.fromJson(e as Map<String, dynamic>)).toList(),
    today: json['today'] as String,
    alertsAvailable: json['alertsAvailable'] as bool? ?? false,
  );
}

/// What the guest form sends. Matches SaveGuestInput on the server.
class GuestInput {
  GuestInput({
    this.id,
    required this.floorId,
    required this.visitDate,
    required this.guestName,
    this.company = '',
    this.hostUserId,
    this.hostName = '',
    this.expectedArrival = '',
    this.notes = '',
    this.licensePlate = '',
    this.vehicle = '',
    this.notifyUserIds = const [],
  });

  final String? id;
  final String floorId;
  final String visitDate;
  final String guestName;
  final String company;
  final String? hostUserId;
  final String hostName;
  final String expectedArrival;
  final String notes;
  final String licensePlate;
  final String vehicle;
  final List<String> notifyUserIds;

  Map<String, dynamic> toJson() => {
    if (id != null) 'id': id,
    'floorId': floorId,
    'visitDate': visitDate,
    'guestName': guestName,
    'company': company,
    if (hostUserId != null) 'hostUserId': hostUserId,
    'hostName': hostName,
    'expectedArrival': expectedArrival,
    'notes': notes,
    'licensePlate': licensePlate,
    'vehicle': vehicle,
    'notifyUserIds': notifyUserIds,
  };
}

/// Sentinel the server uses for "someone without an account" as host.
const otherHost = '__other__';
