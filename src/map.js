import { createApp, reactive, ref, computed, watch, onMounted, toRaw } from '../lib/vue.esm-browser.js';
import * as ntools from './node-utils.js';

const apiUrl = 'https://map.meshcore.dev/api/v1/nodes';
const keyOrder = ['adv_name', 'type', 'link', 'inserted_date', 'updated_date', 'public_key', 'coords', 'params' ]
const humanLabel = {
	coords: 'Coordinates',
	adv_name: 'Name',
	inserted_date: 'Inserted',
	updated_date: 'Last updated',
	public_key: 'Public key',
	type: 'Node type',
	params: 'Radio params',
	link: 'Meshcore link',
};

const types = {
	'1': 'Client',
	'2': 'Repeater',
	'3': 'Room Server',
	'4': 'Sensor'
};

const humanValue = {
	inserted_date(val) {
		return new Date(val).toLocaleString();
	},
	updated_date(val) {
		return new Date(val).toLocaleString();
	},
	coords(val) {
		return `<a target="_blank" href="https://google.com/maps/place/${val.replace(' ', '')}">${val}</a>`;
	},
	type(val) {
		return types[val];
	},
	link(val) {
		return `<a href="javascript:navigator.clipboard.writeText('${val}')">Copy to clipboard</a>`
	},
	params(val) {
		return Object.entries(val).map(([key, val]) => `${key}=${val}`).join(', ')
	}
}

function getSvgIconUrl(text, color) {
	const svg = `
	<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg" >
		<style>
		text { font: bold 150pt sans-serif; fill: #fff; }
		</style>
		<ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="${color}"/>
		<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">${text}</text>
	</svg>`;

	return L.icon({
		iconUrl: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
		iconSize: [32, 32],
		iconAnchor: [17, 17],
		popupAnchor: [0, -16],
	});
}

function clearLocationHash () {
	history.pushState('', document.title, location.pathname + location.search);
}

function getTable(node) {
	return '<table class="node-info"><tbody>'+
		'<tr>' + keyOrder.flatMap(key => node[key] ? [`<td><b>${humanLabel[key]}</b></td><td>${ humanValue[key] ? humanValue[key](node[key]) : node[key] }</td>`] : [] ).join('</tr><tr>') + '</tr>'+
	'</tbody></table>';
}

window.isNewerThan = (date, days) => {
	const daysMs = 1000 * 3600 * 24 * days;
	const dateMs = new Date(date).getTime();

	return dateMs > Date.now() - daysMs;
}

const deletionMailUrl = new URL('mailto:recrof@gmail.com');
deletionMailUrl.searchParams.append('subject', 'MeshCore Map node deletion request');
deletionMailUrl.searchParams.append('body',
	'Please delete my node from MeshCore Map database\n'+
	'MeshCore link: <please insert meshcore:// link here>\n'
);

const appAttribution = `
	App: recrof, <a target="_blank" href="https://www.paypal.com/donate/?business=DREHF5HM265ES&no_recurring=0&item_name=If+you+enjoy+my+work%2C+you+can+support+me+here%3A&currency_code=EUR">
	<strong>support my work</strong></a> |
	<a target="_blank" href="${deletionMailUrl.toString().replaceAll('+', '%20')}"><strong>Node deletion request</strong></a>
`;

const baseMapSelected = localStorage.getItem('baseMapSelected') || 'OpenStreetMap';
const baseMaps = {
	'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: `Tiles: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> | ${appAttribution}`
	}),
	'Esri Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
		maxZoom: 18,
		attribution: `Tiles: &copy; Esri | Sources: Esri, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, GIS Users | ${appAttribution}`,
	}),
};

let initCoords = { lat: 7, lon: 25, zoom: 3 };

const urlParams = Object.fromEntries(new URLSearchParams(location.search));
if(!(isNaN(urlParams.lat) || isNaN(urlParams.lon) || isNaN(urlParams.zoom))) {
	initCoords = urlParams
}

const map = window.leafletMap = leaflet.map('map', {
	minZoom: 2,
	maxBounds: [
		[-90, -180], // top left
		[90, 200], // bottom right
	],
	layers: baseMaps[baseMapSelected],
	zoomControl: false
}).setView([initCoords.lat, initCoords.lon], initCoords.zoom);

map.on('baselayerchange', function(ev) {
	localStorage.setItem('baseMapSelected', ev.name);
});

L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(map);

// map.zoomControl.setPosition('bottomleft');
const icons = Object.fromEntries([1, 2, 3, 4].map(id => [id, L.icon({
	iconUrl: `img/node_types/${id}.svg`,
	iconSize: [32, 32],
	iconAnchor: [17, 17],
	popupAnchor: [0, -16],
})]));

createApp({
	setup() {
		const dialogAddNode = ref();
		const app = window.app = reactive({
			nodes: [],
			nodesByType: {},
			filteredNodes: [],
			search: '',
			link: '',
			nodeFilter: [],
			fromDate: '2025-03-01',
			clusteringZoom: 12,
		});

		const filtersActive = computed(() => app.filteredNodes.length && app.nodes.length !== app.filteredNodes.length);

		const stats = computed(() => {
			const nodes = app.nodes;

			if(!nodes) return [];

			const result = [];
			result.push(`
				<span>total: <b>${nodes.length}</b></span>&nbsp;|
				<i class="node-type pointer-help" title="Total client nodes">person</i><b>${nodes.filter(n => n.type === 1).length}</b>&nbsp;|
				<i class="node-type pointer-help" title="Total repeater nodes">cell_tower</i><b>${nodes.filter(n => n.type === 2).length}</b>&nbsp;|
				<i class="node-type pointer-help" title="Total room server nodes">forum</i><b>${nodes.filter(n => n.type === 3).length}</b>
			`);
			result.push(`<span class="pointer-help" title="Nodes added in last 24 hours">24h: <b>${app.nodes.filter(n => isNewerThan(n.inserted_date, 1)).length}</b></span>`);
			result.push(`<span class="pointer-help" title="Nodes added in last 7 days">7d: <b>${app.nodes.filter(n => isNewerThan(n.inserted_date, 7)).length}</b></span>`);
			result.push(`<span class="pointer-help" title="Nodes added in last 30 days">30d: <b>${app.nodes.filter(n => isNewerThan(n.inserted_date, 30)).length}</b></span>`);

			return result;
		});

		const searchResults = computed(() => {
			if(!app.search) { return [] }

			return app.filteredNodes.filter(
				node => node.adv_name.toLowerCase().includes(app.search.toLowerCase()) || node.public_key.startsWith(app.search)
			).toSorted(
				(a, b) => a.adv_name.localeCompare(b.adv_name)
			).slice(0, 20);
		});

		watch([
				() => app.nodeFilter,
				() => app.fromDate,
			],
			() => {
				const fromDate = new Date(app.fromDate);
				app.filteredNodes = app.nodeFilter
					.flatMap(type => app.nodesByType[type])
					.filter(node => node && (node.updatedDate ? node.updatedDate > fromDate : node.insertDate > fromDate));
				console.log('refresh', app.nodeFilter, app.filteredNodes.length);
				refreshMap({ download: false });
			}
		);

		watch(() => app.clusteringZoom, () => {
			refreshMap({ download: false, clusteringZoom: app.clusteringZoom });
		});

		let markerClusterGroup = L.markerClusterGroup({
			disableClusteringAtZoom: app.clusteringZoom
		});

		async function refreshMap({ download = true, clusteringZoom = 0 } = {}) {
			if(download) {
				const nodesReq = await fetch(apiUrl);
				app.nodes = await nodesReq.json();
				for(const node of app.nodes) {
					let icon = icons[node.type.toString()];
					(app.nodesByType[node.type] ??= []).push(node);

					if(node.type === 1) {
						const label = ntools.getNameIconLabel(node.adv_name);
						const color = ntools.getColourForName(node.adv_name);
						icon = getSvgIconUrl(label, color);
					}

					const marker = node.marker = L.marker(
						[node.adv_lat, node.adv_lon], { icon, title: node.adv_name }
					);

					node.coords = `${node.adv_lat.toFixed(4)}, ${node.adv_lon.toFixed(4)}`;
					node.lastAdvertDate = new Date(node.last_advert);
					node.insertDate = new Date(node.inserted_date);
					node.updatedDate = node.updated_date && new Date(node.updated_date);
					const popup = L.popup({ minWidth: 350, maxWidth: 350, content: getTable(node) });
					marker.bindPopup(popup);
				}
			}

			markerClusterGroup.clearLayers();
			const nodes = app.filteredNodes.length > 0 ? app.filteredNodes : app.nodes;

			map.removeLayer(markerClusterGroup);

			if(clusteringZoom) {
				markerClusterGroup = L.markerClusterGroup({
					disableClusteringAtZoom: clusteringZoom
				});
			}

			for(const node of nodes) {
				markerClusterGroup.addLayer(toRaw(node.marker));
			}

			map.addLayer(markerClusterGroup);
		}

		async function addNode() {
			if(!(app.link && app.link.startsWith('meshcore://'))) {
				alert('Please paste valid meshcore link.');
				return;
			};

			const res = await fetch(apiUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					links: [ app.link ],
					radio: {}
				})
			});
			const reply = await res.json();
			alert(reply.message || reply.error);
			clearLocationHash();
			location.reload();
		}

		function showNode(node) {
			node.marker.openPopup();
			map.flyTo(node.marker.getLatLng(), 19);
			app.search = '';
		}

		function highlightString(source, toHighlight) {
			const escapedSource = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
			const matchIndex = source.toLowerCase().indexOf(toHighlight.toLowerCase());
			const highlightString = matchIndex >= 0 ? source.substring(matchIndex, matchIndex + toHighlight.length) : toHighlight;
			return escapedSource.replace(highlightString, `<b>${highlightString}</b>`);
		}

		map.on('moveend', function(e) {
			const pos = map.getCenter();
			const zoom = map.getZoom();
			history.replaceState({}, '', `/?lat=${pos.lat.toFixed(4)}&lon=${pos.lng.toFixed(4)}&zoom=${zoom}`);
		});

		refreshMap();

		onMounted(() => {
			app.nodeFilter = ['1', '2', '3', '4'];
			if(location.hash === '#add-new-node') {
				dialogAddNode.value.showModal();
				dialogAddNode.value.addEventListener('close', () => clearLocationHash());
			}
		})

		window.refreshMap = refreshMap;
		return {
			app, refreshMap, addNode,
			stats, searchResults, filtersActive,
			showNode, dialogAddNode, highlightString
		}
	},
}).mount('#app')