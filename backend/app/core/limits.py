from ..models.user import UserRole

# Job limits per month (None = unlimited)
ROLE_JOB_LIMITS = {
    UserRole.trial:     None,   # ไม่จำกัดใน 5 วัน (หมดอายุตาม trial_end)
    UserRole.pay_user:  100,    # Pro: 100 jobs/เดือน
    UserRole.free_user: None,   # unlimited (admin gift)
    UserRole.admin:     None,   # unlimited
}

# Feature access per role
ROLE_FEATURES = {
    UserRole.trial: {
        'auto_cut':     True,
        'subtitle_only': True,
        'suggest_edits': True,
        'chat_edit':    True,
        'max_export_quality': '1080p',
        'watermark':    True,
        'priority':     False,
    },
    UserRole.pay_user: {
        'auto_cut':     True,
        'subtitle_only': True,
        'suggest_edits': True,
        'chat_edit':    True,
        'max_export_quality': '1080p',
        'watermark':    False,
        'priority':     False,
    },
    UserRole.free_user: {
        'auto_cut':     True,
        'subtitle_only': True,
        'suggest_edits': True,
        'chat_edit':    True,
        'max_export_quality': '1080p',
        'watermark':    False,
        'priority':     False,
    },
    UserRole.admin: {
        'auto_cut':     True,
        'subtitle_only': True,
        'suggest_edits': True,
        'chat_edit':    True,
        'max_export_quality': '4k',
        'watermark':    False,
        'priority':     True,
    },
}

def get_job_limit(role: UserRole) -> int | None:
    """Return monthly job limit for role. None = unlimited."""
    return ROLE_JOB_LIMITS.get(role, 10)

def can_use_feature(role: UserRole, feature: str) -> bool:
    features = ROLE_FEATURES.get(role, {})
    return features.get(feature, False)
