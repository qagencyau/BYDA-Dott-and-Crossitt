<?php

defined('ABSPATH') || exit;

function byda_iet_get_poll_interval_seconds() {
	$settings = byda_iet_get_settings();
	return max(5, (int) $settings['poll_interval_seconds']);
}

function byda_iet_schedule_refresh_event($token, $delay_seconds = null) {
	$delay = null === $delay_seconds ? byda_iet_get_poll_interval_seconds() : max(1, (int) $delay_seconds);
	wp_clear_scheduled_hook('byda_iet_refresh_enquiry_event', array($token));
	wp_schedule_single_event(time() + $delay, 'byda_iet_refresh_enquiry_event', array($token));
}

function byda_iet_unschedule_refresh_event($token) {
	wp_clear_scheduled_hook('byda_iet_refresh_enquiry_event', array($token));
}

function byda_iet_handle_refresh_enquiry_event($token) {
	$record = byda_iet_get_enquiry_record($token);
	if (!$record || !is_array($record)) {
		return;
	}

	if ('mock' === (isset($record['mode']) ? $record['mode'] : 'live')) {
		$record = byda_iet_refresh_enquiry_record($token, true);
		if (!$record || is_wp_error($record)) {
			return;
		}

		$status = isset($record['status']) ? strtolower((string) $record['status']) : '';
		if (!in_array($status, array('ready', 'failed'), true)) {
			byda_iet_schedule_refresh_event($token);
			return;
		}

		byda_iet_unschedule_refresh_event($token);
		return;
	}

	byda_iet_unschedule_refresh_event($token);
}

function byda_iet_maybe_schedule_cleanup() {
	if (!wp_next_scheduled('byda_iet_cleanup_event')) {
		wp_schedule_event(time() + 300, 'daily', 'byda_iet_cleanup_event');
	}
}

function byda_iet_unschedule_cleanup() {
	$timestamp = wp_next_scheduled('byda_iet_cleanup_event');
	if ($timestamp) {
		wp_unschedule_event($timestamp, 'byda_iet_cleanup_event');
	}

	foreach (byda_iet_get_enquiry_store() as $token => $record) {
		byda_iet_unschedule_refresh_event($token);
	}
}

function byda_iet_run_cleanup() {
	$settings = byda_iet_get_settings();
	$retention_days = max(1, (int) $settings['record_retention_days']);
	$cutoff = time() - ($retention_days * DAY_IN_SECONDS);
	$records = byda_iet_get_enquiry_store();
	$remaining = array();

	foreach ($records as $token => $record) {
		$created_at = byda_iet_to_timestamp(isset($record['createdAt']) ? $record['createdAt'] : null);
		if ($created_at && $created_at < $cutoff) {
			byda_iet_unschedule_refresh_event($token);
			continue;
		}

		$remaining[$token] = $record;
	}

	byda_iet_save_enquiry_store($remaining);
}
