import { CameraRoute, PathFollower, type RouteConfig, type Section } from './route';

export function mainPoints(config: RouteConfig) {
  const marked = config.points.filter((point) => point.mandatory === true);
  return marked.length ? marked : config.points.filter((point) => point.mandatory !== false);
}

export function entitiesShortcut(
  event: { code: string; repeat: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  editingText: boolean,
) {
  // Keep browser auto-repeat: BestClient toggles Entities repeatedly while N is held.
  return !editingText && !event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'KeyN';
}

type CameraPosition = { id: string; x: number; y: number; zoom: number };
type CoordinateTween = {
  from: CameraPosition;
  to: CameraPosition;
  fromDistance: number;
  toDistance: number;
  start: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smootherStep = (value: number) => value * value * value * (value * (value * 6 - 15) + 10);

/**
 * Tab changes use a one-second world-coordinate tween. Wheel input remains on
 * PathFollower's saved route and resumes exactly at the selected route point.
 */
export class SiteFollower extends PathFollower {
  private tween?: CoordinateTween;
  private visual: CameraPosition;
  private queuedWheel = 0;
  lastDuration = 0;

  get transitioning() {
    return !!this.tween;
  }

  constructor(route: CameraRoute, private clock = () => performance.now()) {
    super(route);
    this.visual = route.at(0);
  }

  override goToPoint(id: string) {
    const index = this.route.config.points.findIndex((point) => point.id === id);
    if (index < 0) return;
    this.animateTo(this.route.pointDistances[index]);
  }

  override goTo(section: Section) {
    this.animateTo(this.route.section(section));
  }

  private animateTo(toDistance: number) {
    const now = this.clock();
    if (this.tween?.toDistance === toDistance) return;

    // Materialize the current on-screen position before replacing an animation.
    if (this.tween) this.sample(now);
    if (!this.tween && Math.abs(this.distance - toDistance) < 1e-8) {
      super.seek(toDistance);
      this.visual = this.route.at(toDistance);
      return;
    }

    const from = { ...this.visual };
    const fromDistance = this.distance;
    super.seek(fromDistance);
    this.tween = {
      from,
      to: this.route.at(toDistance),
      fromDistance,
      toDistance,
      start: now,
    };
    this.queuedWheel = 0;
    this.target = toDistance;
    this.automatic = true;
    this.lastDuration = 0;
  }

  private sample(now: number) {
    const tween = this.tween;
    if (!tween) return this.visual;

    const elapsed = Math.max(0, now - tween.start);
    const progress = clamp01(elapsed / 1000);
    const eased = smootherStep(progress);
    this.visual = {
      id: 'camera',
      x: tween.from.x + (tween.to.x - tween.from.x) * eased,
      y: tween.from.y + (tween.to.y - tween.from.y) * eased,
      zoom: this.route.zoom,
    };
    this.distance = tween.fromDistance + (tween.toDistance - tween.fromDistance) * eased;
    this.lastDuration = Math.min(1000, elapsed);

    if (progress === 1) {
      this.visual = { ...tween.to };
      this.distance = this.target = tween.toDistance;
      this.tween = undefined;
      this.automatic = false;
      const queuedWheel = this.queuedWheel;
      this.queuedWheel = 0;
      if (queuedWheel) super.scroll(queuedWheel);
    }
    return this.visual;
  }

  override advance(dt: number, now = this.clock()) {
    if (this.tween) return this.sample(now);
    this.visual = super.advance(dt);
    return this.visual;
  }

  override scroll(delta: number) {
    if (this.tween) {
      // Keep the direct tab transition continuous; apply wheel movement on the
      // saved route as soon as its exact destination point is reached.
      this.sample(this.clock());
      if (this.tween) this.queuedWheel += delta;
      else if (delta) super.scroll(delta);
      return;
    }
    super.scroll(delta);
  }

  override seek(distance: number) {
    this.tween = undefined;
    this.queuedWheel = 0;
    super.seek(distance);
    this.visual = this.route.at(this.distance);
  }
}
