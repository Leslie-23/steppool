import SwiftUI
import WidgetKit

// Data written by the app (lib/widget.ts) into the shared App Group after every sync.
struct StepSnapshot {
  var steps: Int
  var target: Int
  var challenge: String?
  var rank: Int?
  var gapToNext: Int?
  var nextName: String?

  static let placeholder = StepSnapshot(steps: 6420, target: 9000, challenge: "Weekend Walk", rank: 4, gapToNext: 1280, nextName: "Ama")

  static func load() -> StepSnapshot {
    let d = UserDefaults(suiteName: "group.com.steppool.app")
    let rank = d?.integer(forKey: "rank") ?? 0
    let gap = d?.integer(forKey: "gapToNext") ?? 0
    return StepSnapshot(
      steps: d?.integer(forKey: "steps") ?? 0,
      target: max(d?.integer(forKey: "target") ?? 0, 1),
      challenge: d?.string(forKey: "challenge"),
      rank: rank > 0 ? rank : nil,
      gapToNext: gap > 0 ? gap : nil,
      nextName: d?.string(forKey: "nextName")
    )
  }

  var progress: Double { min(Double(steps) / Double(target), 1) }
  var done: Bool { steps >= target }
}

struct Entry: TimelineEntry {
  let date: Date
  let snap: StepSnapshot
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry { Entry(date: .now, snap: .placeholder) }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: .now, snap: context.isPreview ? .placeholder : .load()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    // The app reloads us after each sync; this is just a fallback refresh.
    completion(Timeline(entries: [Entry(date: .now, snap: .load())], policy: .after(.now.addingTimeInterval(30 * 60))))
  }
}

struct Ring: View {
  let progress: Double
  let done: Bool
  var lineWidth: CGFloat = 10
  var body: some View {
    ZStack {
      Circle().stroke(Color("track"), lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: max(progress, 0.001))
        .stroke(
          AngularGradient(colors: [(done ? Color("gold") : Color("volt")).opacity(0.25), done ? Color("gold") : Color("volt")], center: .center),
          style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
        )
        .rotationEffect(.degrees(-90))
    }
  }
}

struct StepWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry

  var body: some View {
    let s = entry.snap
    switch family {
    case .accessoryCircular:
      Gauge(value: s.progress) {
        Image(systemName: "figure.walk")
      } currentValueLabel: {
        Text(s.steps >= 1000 ? "\(s.steps / 1000)k" : "\(s.steps)")
      }
      .gaugeStyle(.accessoryCircularCapacity)
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Text("\(s.steps.formatted()) steps").font(.headline).widgetAccentable()
        if let rank = s.rank, let gap = s.gapToNext, let name = s.nextName {
          Text("#\(rank) · \(gap.formatted()) to pass \(name)").font(.caption)
        } else {
          Text("\(Int(s.progress * 100))% of \(s.target.formatted())").font(.caption)
        }
      }
    case .systemMedium:
      HStack(spacing: 16) {
        ZStack {
          Ring(progress: s.progress, done: s.done, lineWidth: 12)
          VStack(spacing: 0) {
            Text(s.steps.formatted()).font(.system(size: 22, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Color("ink"))
            Text("of \(s.target.formatted())").font(.caption2).foregroundStyle(Color("muted"))
          }
        }
        .frame(width: 110, height: 110)
        VStack(alignment: .leading, spacing: 6) {
          Text("STEPPOOL").font(.caption2.weight(.bold)).kerning(2).foregroundStyle(Color("volt"))
          if let challenge = s.challenge {
            Text(challenge).font(.headline).foregroundStyle(Color("ink")).lineLimit(1)
          }
          if let rank = s.rank {
            Text("#\(rank)").font(.system(size: 28, weight: .bold, design: .rounded)).foregroundStyle(Color("ink"))
          }
          if let gap = s.gapToNext, let name = s.nextName {
            Text("\(gap.formatted()) steps to pass \(name)").font(.caption).foregroundStyle(Color("muted"))
          } else if s.done {
            Text("Goal hit").font(.caption.weight(.semibold)).foregroundStyle(Color("gold"))
          }
        }
        Spacer(minLength: 0)
      }
    default:
      ZStack {
        Ring(progress: s.progress, done: s.done)
        VStack(spacing: 2) {
          Image(systemName: "figure.walk").font(.caption).foregroundStyle(s.done ? Color("gold") : Color("volt"))
          Text(s.steps.formatted()).font(.system(size: 20, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Color("ink")).minimumScaleFactor(0.6)
          if let rank = s.rank {
            Text("#\(rank)").font(.caption2.weight(.semibold)).foregroundStyle(Color("muted"))
          }
        }
      }
      .padding(4)
    }
  }
}

struct StepWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "StepWidget", provider: Provider()) { entry in
      StepWidgetView(entry: entry)
        .containerBackground(Color("$widgetBackground"), for: .widget)
        .widgetURL(URL(string: "steppool://"))
    }
    .configurationDisplayName("Today's steps")
    .description("Your ring, your rank, and who to pass next.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
  }
}
