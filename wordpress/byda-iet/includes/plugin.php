<?php

defined('ABSPATH') || exit;

require_once BYDA_IET_PATH . 'includes/helpers.php';
require_once BYDA_IET_PATH . 'includes/admin-settings.php';
require_once BYDA_IET_PATH . 'includes/storage.php';
require_once BYDA_IET_PATH . 'includes/poller-client.php';
require_once BYDA_IET_PATH . 'includes/geocoding.php';
require_once BYDA_IET_PATH . 'includes/enquiry-service.php';
require_once BYDA_IET_PATH . 'includes/maintenance.php';
require_once BYDA_IET_PATH . 'includes/frontend.php';
require_once BYDA_IET_PATH . 'includes/gravity-forms-ui.php';
require_once BYDA_IET_PATH . 'includes/rest-api.php';

final class Byda_Iet_Plugin {
	private static $instance = null;

	public static function instance() {
		if (null === self::$instance) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function __construct() {
		add_action('admin_init', array($this, 'register_settings'));
		add_action('admin_menu', array($this, 'register_admin_menu'));
		add_action('init', 'byda_iet_register_shortcodes');
		add_action('init', 'byda_iet_register_gf_ui_hooks');
		add_filter('gform_entry_post_save', 'byda_iet_sync_entry_report_url_after_save', 10, 2);
		add_action('rest_api_init', 'byda_iet_register_rest_routes');
		add_action('init', 'byda_iet_maybe_schedule_cleanup');
		add_action('byda_iet_refresh_enquiry_event', 'byda_iet_handle_refresh_enquiry_event', 10, 1);
		add_action('byda_iet_cleanup_event', 'byda_iet_run_cleanup');
	}

	public function register_settings() {
		byda_iet_register_settings();
	}

	public function register_admin_menu() {
		add_options_page(
			'BYDA IET',
			'BYDA IET',
			'manage_options',
			'byda-iet',
			'byda_iet_render_settings'
		);
	}
}
