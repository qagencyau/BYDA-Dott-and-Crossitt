<?php

defined('ABSPATH') || exit;

function byda_iet_get_enquiry_store() {
	$records = get_option(BYDA_IET_STORAGE_OPTION, array());
	return is_array($records) ? $records : array();
}

function byda_iet_save_enquiry_store($records) {
	$records = is_array($records) ? $records : array();
	update_option(BYDA_IET_STORAGE_OPTION, $records, false);
	return $records;
}

function byda_iet_get_enquiry_record($token) {
	$records = byda_iet_get_enquiry_store();
	return isset($records[$token]) && is_array($records[$token]) ? $records[$token] : null;
}

function byda_iet_create_enquiry_record($record) {
	$records = byda_iet_get_enquiry_store();
	$records[$record['token']] = $record;
	byda_iet_save_enquiry_store($records);
	if (function_exists('byda_iet_log')) {
		byda_iet_log(
			'Local enquiry record created.',
			array(
				'record' => byda_iet_debug_record_summary($record),
				'storeCount' => count($records),
			),
			'debug'
		);
	}
	return $record;
}

function byda_iet_update_enquiry_record($token, $updates) {
	$records = byda_iet_get_enquiry_store();

	if (!isset($records[$token]) || !is_array($records[$token])) {
		return null;
	}

	$current = $records[$token];
	$records[$token] = is_callable($updates)
		? call_user_func($updates, $current)
		: array_merge($current, (array) $updates);
	byda_iet_save_enquiry_store($records);

	if (function_exists('byda_iet_log')) {
		byda_iet_log(
			'Local enquiry record updated.',
			array(
				'token' => $token,
				'before' => byda_iet_debug_record_summary($current),
				'after' => byda_iet_debug_record_summary($records[$token]),
				'updateType' => is_callable($updates) ? 'callable' : 'array',
			),
			'debug'
		);
	}

	return $records[$token];
}

function byda_iet_delete_enquiry_record($token) {
	$records = byda_iet_get_enquiry_store();
	if (!isset($records[$token])) {
		return false;
	}

	unset($records[$token]);
	byda_iet_save_enquiry_store($records);
	return true;
}

function byda_iet_list_local_enquiry_records($args = array()) {
	$defaults = array(
		'limit' => null,
		'sort' => 'desc',
	);
	$args = wp_parse_args($args, $defaults);
	$records = array_values(byda_iet_get_enquiry_store());

	usort(
		$records,
		static function ($left, $right) use ($args) {
			$left_time = byda_iet_to_timestamp(isset($left['createdAt']) ? $left['createdAt'] : null);
			$right_time = byda_iet_to_timestamp(isset($right['createdAt']) ? $right['createdAt'] : null);
			return 'asc' === $args['sort'] ? $left_time - $right_time : $right_time - $left_time;
		}
	);

	if (null === $args['limit']) {
		return $records;
	}

	return array_slice($records, 0, max(0, (int) $args['limit']));
}

function byda_iet_list_pending_enquiry_records() {
	return array_values(
		array_filter(
			byda_iet_get_enquiry_store(),
			static function ($record) {
				$status = isset($record['status']) ? $record['status'] : '';
				return !in_array($status, array('ready', 'failed'), true);
			}
		)
	);
}

function byda_iet_find_enquiry_by_byda_id($enquiry_id) {
	foreach (byda_iet_get_enquiry_store() as $record) {
		if ((string) (isset($record['bydaEnquiryId']) ? $record['bydaEnquiryId'] : '') === (string) $enquiry_id) {
			return $record;
		}
	}

	return null;
}
