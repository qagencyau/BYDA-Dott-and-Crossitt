<?php
/*
Plugin Name: BYDA Automation
Description: Automates BYDA enquiries and stores stable report links in Gravity Forms entries.
Version: 0.1.0
Author: QAgency
*/

defined('ABSPATH') || exit;

define('BYDA_IET_VERSION', '0.1.0');
define('BYDA_IET_PATH', plugin_dir_path(__FILE__));
define('BYDA_IET_URL', plugin_dir_url(__FILE__));
define('BYDA_IET_OPTION', 'byda_iet_settings');
define('BYDA_IET_STORAGE_OPTION', 'byda_iet_enquiries');
define('BYDA_IET_LOG_OPTION', 'byda_iet_logs');

require_once BYDA_IET_PATH . 'includes/plugin.php';

function byda_iet_activate() {
	if (function_exists('byda_iet_maybe_schedule_cleanup')) {
		byda_iet_maybe_schedule_cleanup();
	}
}

function byda_iet_deactivate() {
	if (function_exists('byda_iet_unschedule_cleanup')) {
		byda_iet_unschedule_cleanup();
	}
}

register_activation_hook(__FILE__, 'byda_iet_activate');
register_deactivation_hook(__FILE__, 'byda_iet_deactivate');

function byda_iet_init() {
	return Byda_Iet_Plugin::instance();
}

byda_iet_init();
