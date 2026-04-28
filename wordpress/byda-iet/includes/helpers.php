<?php

defined('ABSPATH') || exit;

function byda_iet_now_iso8601() {
	return gmdate('c');
}

function byda_iet_bool_from_value($value, $fallback = false) {
	if (is_bool($value)) {
		return $value;
	}

	if (null === $value || '' === $value) {
		return $fallback;
	}

	return in_array(strtolower(trim((string) $value)), array('1', 'true', 'yes', 'on'), true);
}

function byda_iet_build_url($base_url, $params = array()) {
	$query = array();

	foreach ((array) $params as $key => $value) {
		if (null === $value) {
			continue;
		}

		$query[$key] = is_bool($value) ? ($value ? 'true' : 'false') : $value;
	}

	if (empty($query)) {
		return (string) $base_url;
	}

	$separator = false === strpos((string) $base_url, '?') ? '?' : '&';

	return (string) $base_url . $separator . http_build_query($query);
}

function byda_iet_parse_json_value($body) {
	if ('' === $body || null === $body) {
		return null;
	}

	$decoded = json_decode($body, true);

	if (JSON_ERROR_NONE === json_last_error()) {
		return $decoded;
	}

	return $body;
}

function byda_iet_remote_json_request($method, $url, $args = array()) {
	$headers = isset($args['headers']) && is_array($args['headers']) ? $args['headers'] : array();
	$timeout = isset($args['timeout']) ? max(1, (int) $args['timeout']) : 20;
	$started_at = microtime(true);
	$request_args = array(
		'method' => strtoupper((string) $method),
		'timeout' => $timeout,
		'headers' => $headers,
		'redirection' => 5,
	);

	if (array_key_exists('body', $args)) {
		$request_args['body'] = $args['body'];
	}

	byda_iet_log(
		'HTTP JSON request starting.',
		array(
			'method' => $request_args['method'],
			'url' => byda_iet_debug_url_summary($url),
			'timeout' => $timeout,
			'hasBody' => array_key_exists('body', $request_args),
			'bodyLength' => array_key_exists('body', $request_args) ? strlen((string) $request_args['body']) : 0,
			'headerNames' => array_keys($headers),
		),
		'debug'
	);

	$response = wp_remote_request($url, $request_args);

	if (is_wp_error($response)) {
		byda_iet_log_wp_error(
			'HTTP JSON request failed before a response.',
			$response,
			array(
				'method' => $request_args['method'],
				'url' => byda_iet_debug_url_summary($url),
				'durationMs' => (int) round((microtime(true) - $started_at) * 1000),
			)
		);
		return $response;
	}

	$status = (int) wp_remote_retrieve_response_code($response);
	$body = wp_remote_retrieve_body($response);
	$payload = byda_iet_parse_json_value($body);

	byda_iet_log(
		'HTTP JSON response received.',
		array(
			'method' => $request_args['method'],
			'url' => byda_iet_debug_url_summary($url),
			'status' => $status,
			'durationMs' => (int) round((microtime(true) - $started_at) * 1000),
			'bodyLength' => strlen((string) $body),
			'payloadType' => gettype($payload),
			'payloadKeys' => is_array($payload) ? array_keys($payload) : null,
		),
		$status < 200 || $status >= 300 ? 'warning' : 'debug'
	);

	if ($status < 200 || $status >= 300) {
		return new WP_Error(
			'byda_iet_http_error',
			sprintf('HTTP %1$d for %2$s', $status, $url),
			array(
				'status' => $status,
				'body' => $payload,
			)
		);
	}

	return $payload;
}

function byda_iet_error_message($error, $fallback = 'Unknown error.') {
	if (is_wp_error($error)) {
		return $error->get_error_message();
	}

	if ($error instanceof Exception) {
		return $error->getMessage();
	}

	if (is_string($error) && '' !== $error) {
		return $error;
	}

	return $fallback;
}

function byda_iet_error_status($error) {
	if (!is_wp_error($error)) {
		return null;
	}

	$data = $error->get_error_data();
	if (is_array($data) && isset($data['status'])) {
		$status = absint($data['status']);
		return $status ? $status : null;
	}

	return null;
}

function byda_iet_log($message, $context = array(), $level = 'info') {
	$normalized_level = strtoupper(trim((string) $level));
	$normalized_message = trim((string) $message);
	$payload = !empty($context) ? wp_json_encode($context, JSON_UNESCAPED_SLASHES) : '';
	$prefix = sprintf('[BYDA IET][%s] %s', $normalized_level, $normalized_message);
	error_log($payload ? $prefix . ' ' . $payload : $prefix);
	byda_iet_store_log_entry($normalized_level, $normalized_message, $context, $payload);
}

function byda_iet_get_log_limit() {
	return 300;
}

function byda_iet_normalize_log_entry($entry) {
	if (!is_array($entry)) {
		return null;
	}

	return array(
		'time' => isset($entry['time']) ? (string) $entry['time'] : '',
		'level' => isset($entry['level']) ? (string) $entry['level'] : 'INFO',
		'message' => isset($entry['message']) ? (string) $entry['message'] : '',
		'context' => isset($entry['context']) ? (string) $entry['context'] : '',
	);
}

function byda_iet_get_log_entries($limit = null) {
	$entries = get_option(BYDA_IET_LOG_OPTION, array());
	if (!is_array($entries)) {
		$entries = array();
	}

	$entries = array_values(array_filter(array_map('byda_iet_normalize_log_entry', $entries)));
	$entries = array_reverse($entries);
	if (null !== $limit) {
		$entries = array_slice($entries, 0, max(0, (int) $limit));
	}

	return $entries;
}

function byda_iet_store_log_entry($level, $message, $context = array(), $payload = '') {
	if (!defined('BYDA_IET_LOG_OPTION')) {
		return;
	}

	$entries = get_option(BYDA_IET_LOG_OPTION, array());
	if (!is_array($entries)) {
		$entries = array();
	}

	$payload = '' !== (string) $payload ? (string) $payload : (!empty($context) ? wp_json_encode($context, JSON_UNESCAPED_SLASHES) : '');
	if (strlen($payload) > 6000) {
		$payload = substr($payload, 0, 6000) . '... [truncated]';
	}

	$entries[] = array(
		'time' => byda_iet_now_iso8601(),
		'level' => strtoupper(trim((string) $level)),
		'message' => substr(trim((string) $message), 0, 500),
		'context' => $payload,
	);

	$limit = byda_iet_get_log_limit();
	if (count($entries) > $limit) {
		$entries = array_slice($entries, -$limit);
	}

	if (false === get_option(BYDA_IET_LOG_OPTION, false)) {
		add_option(BYDA_IET_LOG_OPTION, $entries, '', false);
		return;
	}

	update_option(BYDA_IET_LOG_OPTION, $entries, false);
}

function byda_iet_clear_log_entries() {
	delete_option(BYDA_IET_LOG_OPTION);
}

function byda_iet_debug_url_summary($url) {
	$url = trim((string) $url);
	if ('' === $url) {
		return array(
			'present' => false,
		);
	}

	$parts = wp_parse_url($url);

	return array(
		'present' => true,
		'scheme' => isset($parts['scheme']) ? $parts['scheme'] : null,
		'host' => isset($parts['host']) ? $parts['host'] : null,
		'path' => isset($parts['path']) ? $parts['path'] : null,
		'hasQuery' => !empty($parts['query']),
		'length' => strlen($url),
	);
}

function byda_iet_debug_record_summary($record) {
	if (!is_array($record)) {
		return array(
			'present' => false,
		);
	}

	return array(
		'present' => true,
		'token' => isset($record['token']) ? $record['token'] : null,
		'mode' => isset($record['mode']) ? $record['mode'] : null,
		'status' => isset($record['status']) ? $record['status'] : null,
		'bydaEnquiryId' => isset($record['bydaEnquiryId']) ? $record['bydaEnquiryId'] : null,
		'bydaStatus' => isset($record['bydaStatus']) ? $record['bydaStatus'] : null,
		'pollerProvider' => isset($record['pollerProvider']) ? $record['pollerProvider'] : null,
		'pollerStatus' => isset($record['pollerStatus']) ? $record['pollerStatus'] : null,
		'pollerLastCallbackAt' => isset($record['pollerLastCallbackAt']) ? $record['pollerLastCallbackAt'] : null,
		'pollerLastError' => isset($record['pollerLastError']) ? $record['pollerLastError'] : null,
		'hasShareUrl' => !empty($record['shareUrl']),
		'hasFileUrl' => !empty($record['fileUrl']),
		'hasReportUrl' => !empty($record['reportUrl']),
		'hasStorageKey' => !empty($record['storageKey']),
		'reportFinalized' => !empty($record['reportFinalized']),
		'reportFinalizedAt' => isset($record['reportFinalizedAt']) ? $record['reportFinalizedAt'] : null,
		'combinedFileId' => isset($record['combinedFileId']) ? $record['combinedFileId'] : null,
		'combinedJobId' => isset($record['combinedJobId']) ? $record['combinedJobId'] : null,
		'fileUrlExpiresAt' => isset($record['fileUrlExpiresAt']) ? $record['fileUrlExpiresAt'] : null,
		'entryId' => isset($record['entryId']) ? $record['entryId'] : null,
		'updatedAt' => isset($record['updatedAt']) ? $record['updatedAt'] : null,
		'lastPolledAt' => isset($record['lastPolledAt']) ? $record['lastPolledAt'] : null,
		'message' => isset($record['message']) ? $record['message'] : null,
		'error' => isset($record['error']) ? $record['error'] : null,
		'shareUrl' => byda_iet_debug_url_summary(isset($record['shareUrl']) ? $record['shareUrl'] : ''),
		'fileUrl' => byda_iet_debug_url_summary(isset($record['fileUrl']) ? $record['fileUrl'] : ''),
		'reportUrl' => byda_iet_debug_url_summary(isset($record['reportUrl']) ? $record['reportUrl'] : ''),
	);
}

function byda_iet_debug_poller_payload_summary($payload) {
	$payload = is_array($payload) ? $payload : array();

	return array(
		'token' => isset($payload['token']) ? trim((string) $payload['token']) : null,
		'enquiryId' => isset($payload['enquiryId']) ? $payload['enquiryId'] : null,
		'bydaStatus' => isset($payload['bydaStatus']) ? $payload['bydaStatus'] : null,
		'pollerStatus' => isset($payload['pollerStatus']) ? $payload['pollerStatus'] : null,
		'error' => isset($payload['error']) ? substr(trim((string) $payload['error']), 0, 500) : null,
		'combinedFileId' => isset($payload['combinedFileId']) ? $payload['combinedFileId'] : null,
		'combinedJobId' => isset($payload['combinedJobId']) ? $payload['combinedJobId'] : null,
		'storageKey' => isset($payload['storageKey']) ? $payload['storageKey'] : null,
		'fileUrlExpiresAt' => isset($payload['fileUrlExpiresAt']) ? $payload['fileUrlExpiresAt'] : null,
		'reportFinalized' => !empty($payload['reportFinalized']),
		'reportFinalizedAt' => isset($payload['reportFinalizedAt']) ? $payload['reportFinalizedAt'] : null,
		'shareUrl' => byda_iet_debug_url_summary(isset($payload['shareUrl']) ? $payload['shareUrl'] : ''),
		'fileUrl' => byda_iet_debug_url_summary(isset($payload['fileUrl']) ? $payload['fileUrl'] : ''),
		'sourceFileUrl' => byda_iet_debug_url_summary(isset($payload['sourceFileUrl']) ? $payload['sourceFileUrl'] : ''),
		'keys' => array_keys($payload),
	);
}

function byda_iet_log_wp_error($message, $error, $context = array(), $level = 'warning') {
	$data = is_wp_error($error) ? $error->get_error_data() : null;
	byda_iet_log(
		$message,
		array_merge(
			$context,
			array(
				'error' => byda_iet_error_message($error),
				'status' => byda_iet_error_status($error),
				'data' => is_array($data) ? $data : null,
			)
		),
		$level
	);
}

function byda_iet_compute_bbox($points) {
	$lngs = array();
	$lats = array();

	foreach ((array) $points as $point) {
		$lngs[] = isset($point[0]) ? (float) $point[0] : 0.0;
		$lats[] = isset($point[1]) ? (float) $point[1] : 0.0;
	}

	return array(
		min($lngs),
		min($lats),
		max($lngs),
		max($lats),
	);
}

function byda_iet_create_buffered_square($point, $meters) {
	$meters_per_degree_lat = 111320;
	$lat = isset($point['lat']) ? (float) $point['lat'] : 0.0;
	$lng = isset($point['lng']) ? (float) $point['lng'] : 0.0;
	$lat_delta = ((float) $meters) / $meters_per_degree_lat;
	$cos_lat = cos(deg2rad($lat));
	$meters_per_degree_lng = max($meters_per_degree_lat * $cos_lat, 1);
	$lng_delta = ((float) $meters) / $meters_per_degree_lng;
	$ring = array(
		array($lng - $lng_delta, $lat - $lat_delta),
		array($lng + $lng_delta, $lat - $lat_delta),
		array($lng + $lng_delta, $lat + $lat_delta),
		array($lng - $lng_delta, $lat + $lat_delta),
		array($lng - $lng_delta, $lat - $lat_delta),
	);

	return array(
		'type' => 'Polygon',
		'coordinates' => array($ring),
		'bbox' => byda_iet_compute_bbox($ring),
	);
}

function byda_iet_polygon_from_arcgis_rings($rings) {
	if (empty($rings) || empty($rings[0]) || !is_array($rings[0])) {
		return null;
	}

	$first_ring = array();

	foreach ($rings[0] as $point) {
		$first_ring[] = array(
			isset($point[0]) ? (float) $point[0] : 0.0,
			isset($point[1]) ? (float) $point[1] : 0.0,
		);
	}

	$last_index = count($first_ring) - 1;
	$is_closed =
		$last_index > 0 &&
		$first_ring[0][0] === $first_ring[$last_index][0] &&
		$first_ring[0][1] === $first_ring[$last_index][1];

	$ring = $is_closed ? $first_ring : array_merge($first_ring, array($first_ring[0]));

	return array(
		'type' => 'Polygon',
		'coordinates' => array($ring),
		'bbox' => byda_iet_compute_bbox($ring),
	);
}

function byda_iet_normalize_whitespace($value) {
	return trim(preg_replace('/\s+/', ' ', (string) $value));
}

function byda_iet_normalize_upper($value) {
	return strtoupper(byda_iet_normalize_whitespace($value));
}

function byda_iet_normalize_title($value) {
	return ucwords(strtolower(byda_iet_normalize_whitespace($value)));
}

function byda_iet_escape_sql_literal($value) {
	return str_replace("'", "''", (string) $value);
}

function byda_iet_strip_leading_street_number($street_name, $street_number) {
	$street_name = byda_iet_normalize_whitespace($street_name);
	$street_number = byda_iet_normalize_whitespace($street_number);
	if ('' === $street_name || '' === $street_number) {
		return $street_name;
	}

	$pattern = '/^' . preg_quote($street_number, '/') . '\s+/i';
	return preg_replace($pattern, '', $street_name, 1);
}

function byda_iet_parse_street_input($value) {
	$aliases = array(
		'ST' => 'STREET',
		'STREET' => 'STREET',
		'RD' => 'ROAD',
		'ROAD' => 'ROAD',
		'AVE' => 'AVENUE',
		'AVENUE' => 'AVENUE',
		'BLVD' => 'BOULEVARD',
		'BOULEVARD' => 'BOULEVARD',
		'DR' => 'DRIVE',
		'DRIVE' => 'DRIVE',
		'CT' => 'COURT',
		'COURT' => 'COURT',
		'PL' => 'PLACE',
		'PLACE' => 'PLACE',
		'HWY' => 'HIGHWAY',
		'HIGHWAY' => 'HIGHWAY',
		'PDE' => 'PARADE',
		'PARADE' => 'PARADE',
		'TCE' => 'TERRACE',
		'TERRACE' => 'TERRACE',
		'CRES' => 'CRESCENT',
		'CRESCENT' => 'CRESCENT',
		'WAY' => 'WAY',
		'LN' => 'LANE',
		'LANE' => 'LANE',
	);

	$normalized = byda_iet_normalize_upper($value);
	$parts = preg_split('/\s+/', $normalized);
	$last_part = !empty($parts) ? $parts[count($parts) - 1] : '';
	$road_type = isset($aliases[$last_part]) ? $aliases[$last_part] : null;

	if (!$road_type) {
		return array(
			'raw' => (string) $value,
			'normalized' => $normalized,
			'roadName' => $normalized,
		);
	}

	return array(
		'raw' => (string) $value,
		'normalized' => $normalized,
		'roadName' => implode(' ', array_slice($parts, 0, -1)),
		'roadType' => $road_type,
	);
}

function byda_iet_normalize_for_comparison($value) {
	return preg_replace('/[^A-Z0-9 ]/', '', byda_iet_normalize_upper($value));
}

function byda_iet_rank_address_candidate($input, $label) {
	$normalized_label = byda_iet_normalize_for_comparison($label);
	$normalized_street_name = byda_iet_normalize_for_comparison(isset($input['streetName']) ? $input['streetName'] : '');
	$normalized_suburb = byda_iet_normalize_for_comparison(isset($input['suburb']) ? $input['suburb'] : '');
	$street_number = byda_iet_normalize_for_comparison(isset($input['streetNumber']) ? $input['streetNumber'] : '');
	$postcode = isset($input['postcode']) ? (string) $input['postcode'] : '';
	$score = 0;

	if ('' !== $street_number && false !== strpos($normalized_label, $street_number)) {
		$score += 3;
	}

	if ('' !== $normalized_street_name && false !== strpos($normalized_label, $normalized_street_name)) {
		$score += 4;
	}

	if ('' !== $normalized_suburb && false !== strpos($normalized_label, $normalized_suburb)) {
		$score += 3;
	}

	if ('' !== $postcode && false !== strpos($normalized_label, $postcode)) {
		$score += 2;
	}

	if ('' !== $street_number && '' !== $normalized_street_name && 0 === strpos($normalized_label, trim($street_number . ' ' . $normalized_street_name))) {
		$score += 5;
	}

	return $score;
}

function byda_iet_dedupe_sites($sites) {
	$seen = array();
	$deduped = array();

	foreach ((array) $sites as $site) {
		$lat = isset($site['point']['lat']) ? round((float) $site['point']['lat'], 6) : 0;
		$lng = isset($site['point']['lng']) ? round((float) $site['point']['lng'], 6) : 0;
		$key = sprintf('%1$s|%2$s|%3$s', isset($site['label']) ? $site['label'] : '', $lat, $lng);

		if (isset($seen[$key])) {
			continue;
		}

		$seen[$key] = true;
		if (empty($site['id'])) {
			$site['id'] = wp_generate_uuid4();
		}

		$deduped[] = $site;
	}

	return $deduped;
}

function byda_iet_format_address_label($address) {
	if (!is_array($address) || empty($address)) {
		return null;
	}

	$parts = array();

	foreach (array('line1', 'line2', 'locality', 'state', 'postcode') as $key) {
		if (!empty($address[$key])) {
			$parts[] = $address[$key];
		}
	}

	return empty($parts) ? null : implode(', ', $parts);
}

function byda_iet_to_timestamp($value) {
	$time = strtotime((string) $value);
	return false === $time ? 0 : $time;
}

function byda_iet_normalize_street_number($value) {
	return preg_replace('/\s+/', '', strtoupper(trim((string) $value)));
}

function byda_iet_tokenize_words($value) {
	$normalized = preg_replace('/[^A-Z0-9]+/', ' ', strtoupper(trim((string) $value)));
	$parts = preg_split('/\s+/', trim((string) $normalized));
	return array_values(array_filter($parts));
}

function byda_iet_normalize_street_name($value) {
	$aliases = array(
		'ALY' => 'ALLEY',
		'ARC' => 'ARCADE',
		'AV' => 'AVENUE',
		'AVE' => 'AVENUE',
		'BVD' => 'BOULEVARD',
		'CL' => 'CLOSE',
		'CRT' => 'COURT',
		'CT' => 'COURT',
		'CRES' => 'CRESCENT',
		'DR' => 'DRIVE',
		'HWY' => 'HIGHWAY',
		'LN' => 'LANE',
		'PDE' => 'PARADE',
		'PL' => 'PLACE',
		'PKWY' => 'PARKWAY',
		'RD' => 'ROAD',
		'SQ' => 'SQUARE',
		'ST' => 'STREET',
		'TCE' => 'TERRACE',
	);
	$tokens = byda_iet_tokenize_words($value);

	return implode(
		' ',
		array_map(
			static function ($token) use ($aliases) {
				return isset($aliases[$token]) ? $aliases[$token] : $token;
			},
			$tokens
		)
	);
}

function byda_iet_normalize_token_sequence($value) {
	return implode(' ', byda_iet_tokenize_words($value));
}

function byda_iet_normalize_postcode($value) {
	return substr(preg_replace('/\D/', '', (string) $value), 0, 4);
}

function byda_iet_normalize_structured_address($address) {
	if (!is_array($address) || empty($address)) {
		return null;
	}

	return array(
		'streetNumber' => byda_iet_normalize_street_number(isset($address['streetNumber']) ? $address['streetNumber'] : ''),
		'streetName' => byda_iet_normalize_street_name(isset($address['streetName']) ? $address['streetName'] : ''),
		'suburb' => byda_iet_normalize_token_sequence(isset($address['suburb']) ? $address['suburb'] : ''),
		'state' => byda_iet_normalize_token_sequence(isset($address['state']) ? $address['state'] : ''),
		'postcode' => byda_iet_normalize_postcode(isset($address['postcode']) ? $address['postcode'] : ''),
	);
}

function byda_iet_normalize_byda_address($address) {
	if (!is_array($address) || empty($address)) {
		return null;
	}

	$line_1 = isset($address['line1']) ? trim((string) $address['line1']) : '';
	$match = array();
	preg_match('/^([0-9A-Z\/-]+)\s+(.+)$/i', $line_1, $match);

	return array(
		'streetNumber' => byda_iet_normalize_street_number(isset($match[1]) ? $match[1] : ''),
		'streetName' => byda_iet_normalize_street_name(isset($match[2]) ? $match[2] : $line_1),
		'suburb' => byda_iet_normalize_token_sequence(isset($address['locality']) ? $address['locality'] : ''),
		'state' => byda_iet_normalize_token_sequence(isset($address['state']) ? $address['state'] : ''),
		'postcode' => byda_iet_normalize_postcode(isset($address['postcode']) ? $address['postcode'] : ''),
	);
}

function byda_iet_build_normalized_address_key($normalized_address) {
	if (!$normalized_address || !is_array($normalized_address)) {
		return '';
	}

	return implode(
		'|',
		array(
			isset($normalized_address['streetNumber']) ? (string) $normalized_address['streetNumber'] : '',
			isset($normalized_address['streetName']) ? (string) $normalized_address['streetName'] : '',
			isset($normalized_address['suburb']) ? (string) $normalized_address['suburb'] : '',
			isset($normalized_address['state']) ? (string) $normalized_address['state'] : '',
			isset($normalized_address['postcode']) ? (string) $normalized_address['postcode'] : '',
		)
	);
}

function byda_iet_address_key_from_structured_address($address) {
	return byda_iet_build_normalized_address_key(byda_iet_normalize_structured_address($address));
}

function byda_iet_address_key_from_byda_address($address) {
	return byda_iet_build_normalized_address_key(byda_iet_normalize_byda_address($address));
}

function byda_iet_addresses_match($left, $right) {
	if (!$left || !$right) {
		return false;
	}

	return
		$left['streetNumber'] === $right['streetNumber'] &&
		$left['streetName'] === $right['streetName'] &&
		$left['suburb'] === $right['suburb'] &&
		$left['state'] === $right['state'] &&
		$left['postcode'] === $right['postcode'];
}
