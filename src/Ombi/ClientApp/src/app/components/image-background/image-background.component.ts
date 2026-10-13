import { OmbiCommonModules } from '../modules';
import { Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ImageService } from '../../services';
import { fadeInOutAnimation } from 'app/animations/fadeinout';
import { AmbientService } from '../../shared/ambient/ambient.service';

@Component({
	standalone: true,
	selector: 'ombi-image-background',
	templateUrl: './image-background.component.html',
	styleUrls: ['./image-background.component.scss'],
	imports: [...OmbiCommonModules],
	providers: [ImageService],
	animations: [fadeInOutAnimation],
})
export class ImageBackgroundComponent implements OnInit, OnDestroy {
	public background: any;
	public name: string;
	private timer: any;

	constructor(private images: ImageService, private sanitizer: DomSanitizer, @Optional() private ambient?: AmbientService) {}

	public ngOnDestroy(): void {
		clearTimeout(this.timer);
		this.ambient?.release(this);
	}

	public ngOnInit(): void {
		this.cycleBackground();

		this.timer = setInterval(() => {
			this.cycleBackground();
		}, 30000);
	}

	private cycleBackground() {
		this.images.getRandomBackgroundWithInfo().subscribe((x) => {
			this.background = this.sanitizer.bypassSecurityTrustStyle('url(' + x.url + ')');
			this.name = x.name;
			// Let the Aurora ambient pick up the artwork's colours too.
			this.ambient?.set(this, x.url);
		});
	}
}
